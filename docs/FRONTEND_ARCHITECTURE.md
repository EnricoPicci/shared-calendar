# Front end — Architecture: the view layer

| | |
|---|---|
| Status | v17 — the view layer **implemented** (2026-11-20); **the hosting and the deployment decided** (2026-11-21, section 13, brief `prompts/93-deploy-frontend.md`), **written** (`docs/FRONTEND_DEPLOY_PLAN.md` step 70, 2026-11-21, brief `prompts/94-step-70-implementation.md`: the template, the deploy command and its gate) **and deployed** (step 72, 2026-11-21, brief `prompts/96-step-72-implementation.md`): the stack `shared-calendar-web` exists and the page is in use at the address of its output `PageUrl`; what the first deployment proved, and what it has not yet looked at, is in sections 13.3, 13.5 and 13.7, and the rest of section 13 is brought to the present tense at step 73; **logout is built** (step 71, 2026-11-21, brief `prompts/95-step-71-implementation.md`: `docs/FRONTEND_SERVICES.md` v8, section 20; here sections 6 and 13.7), proven against the local stack, and at the deployed page as far as the revocation answered 200. Every screen of `docs/FRONTEND_VIEW_PLAN.md` section 3 exists in `frontend/`, tested and walked in a browser against the local stack (`docs/FRONTEND_WALK.md`); the plan's steps 60 to 69 are done (briefs `prompts/83-step-60-implementation.md` to `prompts/92-step-69-implementation.md`). What is built: the build and dev-server commands and the tests' environment (section 12); the shell with its navigation (section 6); the logic layer (section 5.1); the login; the week calendar with booking, cancelling, the note and the change; a User's "My appointments"; and the Administrator's settings, users and availability (the types, the weekly patterns and a single date). The fallback of section 7 was not needed; what the code became, and the verdict on the fallback, are in sections 7.1 and 7.2; section 3, rule 12 was reworded after it |
| Scope | How the views of the front end are written: the technology, the layers and which may use which, the rules of a view, the logic between the services and the views, the shell, the tests, the folders; and, since v13, how the page is hosted and deployed (section 13) |
| Not in scope | Keeping the session across a reload, the size of the bundle, a domain of our own: open points of section 10, none of which blocks a deployment. The design of the logout service: it is `docs/FRONTEND_SERVICES.md` section 20; section 13.7 here keeps the direction and what follows from it for the page |
| Depends on | `docs/FRONTEND_SERVICES.md` v8 (the services the views use, the sign-out among them), `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need), `docs/FOLDER_STRUCTURE.md` section 7, `docs/FRONTEND_VIEW_PLAN.md` (the order of work of the views), `docs/FRONTEND_DEPLOY_PLAN.md` (the order of work of the hosting) |
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
| v10 | 2026-11-20 | Plan step 68: a single date (date overrides and one-off windows). Section 4: the screen's third part (the date, the day, the windows of "this day only" as rows that hold a button only, the extra windows), a screen with two views, what the two share and how, the dialog that confirms with neutral words and five kinds, the conflicts list's new places. Section 5.1: sixteen files (`date.model.ts` and `date.screen.ts` are new), the second logic object of the screen and what the first hands it, what is read and when, the checks of the date, the draft, the five writes; the three new sentences of `failureText` and the two new things that can be attempted. Section 6: the fifth entry mounts two views and starts two objects; the second `CalendarService` of a session. Section 8: a native date field typed by keyboard, where the keyboard is after a row is gone, a button the page does not offer. Section 9: the tree. Section 12.1: the size at step 68. Section 11: decisions 109 to 128. |

| v11 | 2026-11-20 | Plan step 69, the closing. Status: implemented. The text is brought to the present tense: it says what is, not what a step added. Section 3, rule 2: why nothing shows before the script decides. Section 4: the handlers of a view that was left; a slot and an appointment named with their day for a screen reader; the dialogs that ask described by their question; the sentence of an overlap among the windows of "this day only" said once, under "Start", with "End" marked (a field in fault with no words of its own). Section 6: the sequence from "Sign in" to the first week. Section 7: the new sections 7.1, what the code became, and 7.2, the verdict on the fallback, as a proposal. Section 8: the walk, a document of its own (`docs/FRONTEND_WALK.md`); the table of the dialogs and the focus; the two tests of `page.test.ts` on reading the page without a mouse. Section 10: every open point as it stands today. Section 12.1: the size at step 69 and the share of `zod`, measured again. Section 11: decision 106 closed, decision 123 as settled, decisions 129 to 136. The trial's code (`prototypes/`) is deleted; what was still true of its page on the loading sequence is in sections 3, 4 and 6. |
| v12 | 2026-11-20 | The verdict of section 7.2 taken at the review of plan step 69: section 3, rule 12 and the third condition of section 7 are reworded to allow what `availability.parts.ts` is, a file of helpers shared by the views of one screen, with its bound. Section 7.2 says what was decided, no longer what was proposed. Section 11: decision 135 as taken, decision 137. No code changed. |
| v13 | 2026-11-21 | The hosting and the deployment, decided (brief `prompts/93-deploy-frontend.md`); nothing built, no code changed. New section 13: what the browser talks to, the stack `shared-calendar-web` (a private bucket behind a CloudFront distribution), the API through the page's address (one origin, no CORS, the back end unchanged), the headers sent with the page, the files and their caching, the deploy command with its gate and its checks, the direction for logout, what is left out on purpose. Section 10: O1, O2 and O5 decided, O7 with its direction, new open point O10 (a domain of our own); what blocks a deployment now is work, not a decision. Section 12.1: where a deployment's values come from. Section 11: decisions 138 to 153. The order of work is a new document, `docs/FRONTEND_DEPLOY_PLAN.md` (steps 70 to 73). |
| v14 | 2026-11-21 | `docs/FRONTEND_DEPLOY_PLAN.md` step 70: the hosting's template, the deploy command and the gate's shared check are written; nothing is deployed. **Corrected after AWS's documentation:** section 13.3, rule 3 and decision 141: the cache policy `CachingDisabled` keeps no failure, so the distribution sets nothing for failures (no `CustomErrorResponses`); which failures CloudFront keeps elsewhere, and when. Section 13.2: what the template holds as written (no `Transform`, the names of its resources, the bucket's ownership setting). Section 13.4: the header for HTTPS names no sub-domain. Section 13.5: CloudFront's own copy lives a second. Section 13.6: the command as written (its one argument `--dry-run`, the build checked before an upload, the wait for the invalidation, the statuses of the four checks, what `sam deploy` needs and does not). Section 12.2: the dev server's policy. Section 10: O1, O2 and O5 as they stand. Section 11: decisions 141 and 147 corrected, decisions 154 to 158. |
| v15 | 2026-11-21 | **The sign-out as designed** (`docs/FRONTEND_DEPLOY_PLAN.md` step 71, part A, brief `prompts/95-step-71-implementation.md`; `docs/FRONTEND_SERVICES.md` v8, section 20). No code changed: "Sign out" still only clears the `SessionStore`, and every changed place says so. **Corrected: the order of section 13.7 and of decision 152.** Version 13 wrote "revokes, then clears"; the decision taken with the design is the reverse: the page forgets the person at once and Cognito is told after, with a time limit, so that a slow or dead network never keeps a person signed in. Section 13.7 rewritten with it, and with what the step found: `RevokeToken` confirmed on AWS's pages (no credentials, no secret), cognito-local implements it, whether a browser may call it from another origin is not in the documentation and is proven at step 72. Section 6: the start-up will create a fourth page-wide object, the `LogoutService`, and hand the shell its one method (point 1); "Sign out" will call it and nothing else (point 2); the sequence of a sign-out with the reset before and the request after. Section 10, row O7: designed, not closed. |
| v16 | 2026-11-21 | **The sign-out built** (`docs/FRONTEND_DEPLOY_PLAN.md` step 71, part B, brief `prompts/95-step-71-implementation.md`), as version 15 described it; no difference found while building. `shell.ts`: `runShell` creates the `LogoutService` with the store, the `LoginService` and the `RefreshService`; `mountShell` is handed its one method; the handler of "Sign out" calls it and nothing else. Sections 6 and 13.7 in the present tense; section 10, row O7 closed; section 8, what the shell's test gained. Checked in a browser against the local stack, also with the local Cognito stopped and with it silent (section 13.7). Section 13.1's table does not change: the local page and the deployed one sign out the same way. Section 7.1 is not measured again: it is the record of `docs/FRONTEND_VIEW_PLAN.md` step 69. |
| v17 | 2026-11-21 | **The first deployment** (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, brief `prompts/96-step-72-implementation.md`; the record is `docs/RUNBOOK.md` section 5.5). Only what the deployment proved or disproved is changed; the rest of section 13 still speaks as before it, until step 73. Section 13: the stack exists. Section 13.2: the account may create a distribution. Section 13.3: rule 1 (the `Authorization` header arrives) and rule 3 (no failure of the API is kept) are proven, each with how it was seen; **corrected: the API's access log shows the caller's own address for a call made by the page, not CloudFront's** (also decision 153), and a path that is no route leaves no line in it. Section 13.5: the sizes as downloaded, compressed with Brotli (open point O9). Section 13.7: the browser may call `RevokeToken` from the page's address (answered 200); that a refresh with the revoked token is then refused by the real Cognito was not tried. Section 10: one sentence on where the rows stand. No code changed. |

**The decision in one paragraph.** The views are written in **plain HTML and CSS, with one
TypeScript module script**. The markup of every screen is in one `index.html`; the script
subscribes to the services' streams, fills the markup and turns the user's actions into service
calls. There is no rendering library, no framework and no compiler beyond the one bundle command
a browser needs anyway. `lit-html` is the fallback, added for a single view on the day the plain
code of that view proves painful (section 7); no view needed it (section 7.2).

---

## 1. Where this document stands

- This document is the source of truth for **the view layer**: a view, the logic it uses, the
  shell.
- `docs/FRONTEND_SERVICES.md` stays the source of truth for the services. Nothing here changes a
  service.
- `docs/ARCHITECTURE.md` stays the source of truth for the API. On any conflict it wins.
- `docs/FRONTEND_VIEW_OPTIONS.md` is the record of why this option was chosen. It is not a source
  of truth: where it differs from this document, this document is right.
- The order of work was that of `docs/FRONTEND_VIEW_PLAN.md` (steps 60 to 69, done).
- It is also the source of truth for **the hosting and the deployment** of the page (section 13),
  decided, written and not yet deployed; their order of work is `docs/FRONTEND_DEPLOY_PLAN.md`
  (steps 70 to 73, the first done).
- `docs/FRONTEND_WALK.md` is the walk through every screen in a browser: the check to repeat
  after a later change. It is not a source of truth either: this document and the tests win.

The choice was tried before it was made: the login view and the week calendar were written twice,
in plain HTML/CSS and with `lit-html`, against the real services and the local stack. Several
rules below come from that trial. Its code, the folder `prototypes/`, was throw-away and was
deleted at `docs/FRONTEND_VIEW_PLAN.md` step 69; it is in git history (commit `f2ade74` is the
last that holds it).

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
   in-memory session alive from screen to screen. The style sheet's first rule about it is
   `[hidden] { display: none !important; }`, so that no other rule can show an element the
   script has not shown: between the moment the page is parsed and the moment the script
   decides, the page is blank, and nothing of a screen flashes.

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
    two small helpers of section 4 (`find`, `copy`). The views of one screen may share a file
    of helpers that do what a view does by hand: find elements once; set their values, texts
    and attributes; fill copies of a `<template>` with `textContent`. Such a helper never
    decides what is shown (the logic layer does), never makes an element other than by
    copying a template, and keeps no state beyond that of rule 10. The day someone wants a
    helper that compares what is on the page with what should be there, or that makes markup
    from data without a template, is the day to use the fallback of section 7 for that view,
    not to write a rendering library. No lint rule can hold this bound: the review of a view
    does.

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

**The handlers of a view that was left stay where they are.** A handler is attached by
assigning a property (`form.onsubmit = …`, `button.onclick = …`), never with
`addEventListener`. Leaving a view does not remove them: they stay on elements that are hidden,
which nobody can press, and the next mount replaces each of them, because assigning the
property again overwrites the one before. This is why the same view can be mounted again and
again on the same elements, for one person after another, without a handler being called
twice, and why a teardown lists texts, lists and dialogs and no handler.

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
(`docs/FRONTEND_VIEW_PLAN.md` step 62): a keyboard reaches them. On the screen each shows its
time, and its day is the column it stands in; a screen reader reaches a button without its
column, so the view gives each a name (`aria-label`) made of the day's label and the button's
own words: "Mon 23 Nov 09:00–10:00 free", "Mon 23 Nov 11:00–12:15 You First lesson". A window
and a busy block stay plain elements. The
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
- **What the open book dialog is about** includes the move it confirms, or `null` for a
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
`#settings`, `frontend/src/views/settings.view.ts`; the pattern of every form of the users and
of the availability). The markup of one field:

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
  logic layer says which fields are in fault and in which words (section 5.1). **A field can
  be in fault with no words of its own**: the logic layer names it with an empty sentence,
  the view marks it and writes nothing under it, and the sentence of another field names it.
  The one case is an overlap among the windows of "this day only", which is of "Start" and
  "End" together (below, "A single date").
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

**A dialog that confirms a deletion** (`dialog.delete`, inside `#users`; the pattern of the
dialog that confirms on the availability screen, below).

```html
<dialog class="delete" aria-labelledby="delete-title" aria-describedby="delete-question">
  <h3 id="delete-title">Delete user</h3>
  <p class="question" id="delete-question"></p> <!-- whom, what follows, and that it cannot be undone -->
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
- **The question describes the dialog** (`aria-describedby`): when it opens, a screen reader
  says its name, then the question, then "Keep". Without it the question, which is the whole
  point of the dialog, would be said only to someone who went looking for it.
- **No handler of the `close` event**, like every dialog of the page (the shape of a dialog
  above, "A close does nothing"): whom it is about is replaced at the next opening.
- **The button of a row says whom** to a screen reader (`aria-label`, "Delete alice"), set by
  the script with the words of the logic layer.
- No helper that builds or updates nodes was written (section 7); the view's size is in
  section 7.1.

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
  `change`). Three functions serve the four: what a form holds, as text (`held`); a form
  filled with given values (`fill`); and what a write says in its form (`say`): each field in
  fault marked with its sentence under it, the failure, the appointments in the way. They set
  values and texts of elements found once; none builds a node. They are in the file the
  screen's two views share ("A screen with two views" below).
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

- **Four places**: the form that creates a pattern, the dialog that changes one, the dialog
  that confirms (for a pattern's deletion, and for "not available", the way back to the
  weekly patterns and an extra window's deletion), and under the windows of "this day only"
  when their save is refused. One template for a row, `tpl-conflict`; one function of the
  logic layer that makes the rows (`conflictList`, section 5.1); one function of the views
  that draws a list in a place (`showConflicts`). Adding an extra window never conflicts
  (`docs/SHARED_CALENDAR_SPEC.md` R-AV-04), so its form has no list.
- **The failure is one sentence, and the list stands under it** with the sentence that counts
  it. A failure that names no appointment shows its sentence alone.
- **Personal data** (`docs/FRONTEND_SERVICES.md` section 17.7): usernames and times reach the
  page through `textContent` only and are never logged. The list is taken out of the page at
  the next try (the stream no longer carries it), at the next opening of the dialog that
  showed it, and when the view is left. The id of an appointment never reaches the page.
- **Nothing can be done to an appointment from the list**: the sentence sends the
  Administrator to the week ("Cancel or move them in the week first.").
- **The fourth place was added with no word more** (`docs/FRONTEND_VIEW_PLAN.md` step 68): the
  markup above, `tpl-conflict`, `conflictList` and `showConflicts`.

**One dialog confirms** (`dialog.delete`, inside `#availability`): the dialog of the users
above, with three differences. It serves five things: the deletion of a type, of a pattern
and of an extra window, the way back to the weekly patterns (the deletion of a date's own
windows) and "not available", which deletes nothing. So its fixed words are neutral:
"Please confirm", "Keep", "Confirm"; what will happen is in the question, which the logic
layer makes ("Delete the type Studio? This cannot be undone.", "Make Monday 23 November 2026
not available? …"). It has the conflicts list. And two views open it, so it is mounted once,
apart from both (`mountConfirm`, in `availability.parts.ts`):

```ts
export type Confirmed = { busy: boolean; failure: string | null; conflicts: ConflictList | null; done: boolean };
export type Tell = (outcome: Confirmed) => void;   // how a view tells the opening it made
export type Confirm = { subscription: Subscription; open: (question: string, busy: boolean, confirmed: () => void) => Tell };

// In a view: the dialog is opened with the question and with what its button does.
const openDelete = (kind: 'type' | 'pattern', id: string, words: string) => {
  deleting = { kind, tell: confirm.open(words, deletePending[kind], () => (kind === 'type' ? types.remove(id) : rules.deletePattern(id))) };
};
```

- **What is local to the dialog** is in `mountConfirm`: which opening it is on, what its
  button does, and whether it was pressed since (the "asked" of the shape of a dialog). An
  opening starts clean; no handler of the `close` event.
- **A view tells the opening it made, and only that one.** `open` returns a function, `Tell`,
  through which the view says what the action is doing: under way, failed (with the
  appointments in the way), done. After the next opening, by either view, that function says
  nothing: a state that arrives late for a type cannot write into a dialog that is by then
  about a date. The button is disabled while the action is under way; a failure is shown,
  and a success closes the dialog, only when this opening's button was pressed.
- **Where the outcome comes from** differs by view. For a type and a pattern it is the state
  of the service of its kind (`removeState$`, `deletePatternState$`): a state of the other
  kind is not told. For the three things of a single date it is one outcome of the
  `DateScreen`'s stream, with what it is about (section 5.1).
- **Mounted by whoever shows the screen** (the entry of the table of screens, section 6) and
  handed to both views as a dependency. The precedent is `detail.view.ts`, a dialog two
  views use; there one view at a time mounts it, here two views are on show together, so
  neither can be the one that mounts it.
- **"Keep" first**, as before: the keyboard is on it when the dialog opens.

**A single date** (`docs/FRONTEND_VIEW_PLAN.md` step 68: the screen's third part, `section
.one-date` of `#availability`, `frontend/src/views/date.view.ts`). Under the heading "A single
date": a native date field and "Show"; under it, once a date is shown, that day.

- **The date's form** is a form whose field is checked: `novalidate`, the refusal under the
  field, nothing decided by the view or by the browser. No `min` is set on the field.
- **The day** is two descriptions and what changes them. "As the weekly patterns give it": a
  list of windows to read, or one sentence. "As it is now": one sentence that says which of
  the three the day is (the weekly patterns apply; it has its own windows; it is not
  available), the day's own windows, and three buttons: "This day only…", "Not available on
  this day" and "Back to the weekly patterns", each shown when the stream offers it. "Extra
  windows": their list, each row with "Delete", and a fixed form that adds one ("Start",
  "End", "Type", "Add window"). On the page a date override is "its own windows" and a
  one-off window "an extra window".
- **"This day only" is put together, then saved in one go.** The button starts a list of
  windows, shown in a box of its own: each row is the window's hours, its type and
  "Remove"; a fixed form under the rows ("Start", "End", "Type", "Add") adds one; "Discard"
  and "Save this day" end it. A window that overlaps one of the rows is refused at "Add":
  "Start" and "End" are both marked in fault, and the sentence, which names both, stands
  once, under "Start" (a field in fault with no words of its own, above). **No row holds a field** (section 3, rule 4): a window is
  removed and added, not edited in place, which is what keeps the first condition of
  section 7 away. The list is state of the logic layer (section 5.1): the view draws the
  rows the stream brings and calls `add`, `remove(index)`, `discard` and `save`.
- **Nothing is sent before "Save this day"**: one request with the whole list. A failure is
  said under the rows, with the conflicts list, and the rows stay.
- **Three templates**, all an `<li class="window-row">` with the hours and the type:
  `tpl-date-window` (to read), `tpl-draft-row` (with "Remove") and `tpl-extra-row` (with
  "Delete"). A button's name for a screen reader says which window it is of.
- **The two forms that add a window** have the shape of the screen's other forms. Their
  lists of times are the patterns' (`START_CHOICES`, `END_CHOICES`); their list of types
  follows the stream and keeps what is chosen. They start, and go back after an add that
  was accepted, on 09:00 to 10:00 with no type chosen.
- **What is redrawn**: the day's lists when the stream brings another day object, the rows
  being put together when it brings another object for them, the choices when theirs
  changes. A notification of another kind leaves every row's button the same element.
- **While windows are being put together the day's three buttons are not shown** (the
  stream offers none): there is one thing under way, and its own two buttons end it.
- The view listens to one stream; its size is in section 7.1.

**A screen with two views** (`docs/FRONTEND_VIEW_PLAN.md` step 68). The availability is one
element and one entry of the table of screens, with two mount functions, each listening to
its own logic object: `mountAvailability` (the types and the patterns) and `mountDate` (a
single date). Both are mounted on `#availability`: the templates of a choice and of a
conflict and the dialog that confirms belong to the whole screen. `mountDate` looks its own
elements up under `.one-date` only, and `mountAvailability` reaches its lists of types
through its own forms, so neither touches the other's part.

What the two share is one file, `frontend/src/views/availability.parts.ts`:

| Export | What it is |
|---|---|
| `availabilityParts(root)` | Finds the screen's templates once and returns `copy` (a copy of a template's element), `choices` (the `<option>`s of a list), `showConflicts` (a conflicts list drawn in a place) and `form(selector, names)`: a form whose fields are checked, found once, with `held()`, `fill(values)` and `say(outcome)` |
| `mountConfirm(root)` | The dialog that confirms, above |

- These are functions `availability.view.ts` first had as local ones
  (`docs/FRONTEND_VIEW_PLAN.md` step 67), moved as they were when the second view needed the
  same ones: writing them twice was the alternative. None decides anything; each sets values
  and texts of elements found once, or fills copies of a template with `textContent`.
- **It is more than the "two small helpers" of section 3, rule 12**, and it is not local to
  one view: rule 12 was reworded to allow exactly this, with its bound (section 7.2).
- The sizes of the two views and of this file are in section 7.1.

## 5. The logic layer

Some of what the screens need may not be in a view (section 3, rule 1) and is not a remote call
either. It lives in the logic layer:

| What | Example |
|---|---|
| State that is not the server's and not one view's | Which week is on screen, and its Monday; which appointment is being moved to another time; which list of "My appointments" is on show, and the period of its history; which date of the availability is on show, and the windows of "this day only" while they are being put together |
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

### 5.1 As built: sixteen files

`frontend/src/logic/` (`docs/FRONTEND_VIEW_PLAN.md` steps 61 to 68), each with its test in
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
| `availability.screen.ts` | The class `AvailabilityScreen`: the settings (for the time zone), the types and the patterns read when the screen is shown, the four writes that have a check, and the lists read again after every write and when the page becomes visible; and `known$`, what it knows, for the object of a single date |
| `date.model.ts` | Pure, for a single date: the date chosen checked (`dateFor`), a date in words (`dateWords`), the day as the weekly patterns give it and as it is now, with the three questions of the dialog (`dayModel`), the windows "this day only" starts from (`startingWindows`), those windows ready to draw (`draftModel`), one more of them or why not (`draftAdd`), and an extra window's body from its form (`windowFor`) |
| `date.screen.ts` | The class `DateScreen`: the date on show, its day read from the calendar view and read again after every write, the windows of "this day only" being put together, and the five writes on a date |

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
  setting is shown or changed. Nothing here uses `DEFAULT_TIME_ZONE`. **The week screen opens
  without that request**: its limit around midnight (above) stands, and lifting it has a
  precedent here.
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
  refusal by the check (no call, the lists kept; a field named with an empty sentence is in
  fault with no words of its own), `busy` while the call is under way, then
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
- **One `CalendarSettingsService` per session serves three screens**; each listens while
  it is started and takes no result that was there before its `start()`.
- **What is kept, and what is not.** Nothing: the end of the subscription of `start()`
  forgets the lists, the zone, what the forms said and what was typed, and the next `start()`
  reads everything again.

**A single date** (`docs/FRONTEND_VIEW_PLAN.md` step 68; the Administrator's; the screen's
second logic object).

```ts
// What the AvailabilityScreen knows that this object needs: nothing else passes between the two.
export type Known = { zone: string | null; zoneWhy: string | null; types: readonly AvailabilityType[] | null; patterns: readonly WeeklyPattern[] | null };

export type DateState = {
  loading: boolean;
  field: { date: string }; refusal: string | null;          // the date field, and why "Show" was not followed
  unread: string | null; day: DayModel | null;              // the day on show, or why it could not be read
  offers: { change: boolean; back: boolean };               // which of the day's three buttons are offered
  choices: readonly Choice[];                               // the types, for the two forms that add a window
  draft: DraftModel | null;                                 // the windows of "this day only" being put together
  addFields: WindowFields; add: Ask<WindowField>; save: Ask<never>;
  windowFields: WindowFields; window: Ask<WindowField>;     // the form that adds an extra window
  confirm: Ask<never>;                                      // the action the dialog confirmed; `about` says which
};

export class DateScreen {
  readonly date$: Observable<DateState>;
  // `known$`: of the AvailabilityScreen. `calendar`: `load` and `calendarResult$` of a
  // CalendarService of this part's own. `types`, `rules`: the four writes of a date, and the
  // results of every write to a type and to a pattern.
  constructor(known$: Observable<Known>, calendar: DateCalendar, types: DateTypes, rules: DateRules, now: () => Date, visible$: Observable<unknown>) { … }
  start(): Subscription { … }            // reads nothing: takes what is known
  show(text: string): void { … }         // the date field as it is: read, or why not
  retry(): void { … }
  edit(): void { … }                     // "This day only…": starts the windows from the day on show
  add(fields: WindowFields): void { … }  // one window more, or why not
  remove(index: number): void { … }
  discard(): void { … }
  save(): void { … }                     // one setOverride with the whole list
  addWindow(fields: WindowFields): void { … } // an extra window on the date on show
  close(): void { … }                    // "not available": setOverride with no window
  back(): void { … }                     // deleteOverride
  removeWindow(windowId: string): void { … }
}
```

- **Two objects, one screen.** The `AvailabilityScreen` reads the settings, the types and
  the patterns, as before; its stream, its state and its tests did not change. It gained
  one output, `known$`: the calendar's time zone (null until the settings are read), why
  the settings could not be read (null while they are being read), the types as last read
  and the patterns as last read (null after a read that failed). It notifies after every
  read that was answered and, with nothing known, when its subscription ends. The
  `DateScreen` is handed that stream and reads none of the three itself. The shell starts
  the first, then the second (section 6).
- **Nothing is read until a date is shown.** At `start()` the object takes what is known.
  The date field starts on today, the calendar's, once the zone says which day that is
  (`field` becomes another object, once); nothing is shown for it until "Show".
- **The date is checked here, before any call** (`dateFor`): an empty field and a text that
  is not a date ("Choose a date."), by the shared `LocalDate` schema; a date before today
  ("A date before today cannot be changed. The week shows what a past day had."), today
  being the date of `now()` in the calendar's zone, never the browser's
  (`docs/SHARED_CALENDAR_SPEC.md` R-AV-02). Today is accepted. A refusal stands under the
  field, no request is made, and the day on show stays.
- **While the calendar's time zone is not known no date can be judged**, so "Show" is
  refused with no request: with the sentence of the failed read of the settings, the one
  the patterns' list shows, or, while they are still being read, "The calendar is still
  being read. Try again in a moment." The sentence goes by itself when the zone arrives
  (after the "Try again" of the patterns' list, or when the tab is shown again).
- **The day as it is now is read from `GET /calendar` for that one date**
  (`CalendarService.load(date, date)`), as the Administrator: `hasOverride`, and each
  window with its `source` (`docs/SHARED_CALENDAR_SPEC.md` section 11.6). The API has no
  route that lists the overrides or the one-off windows. The object has a `CalendarService`
  of its own, not the week's, which has one pair of streams and one pending call
  (section 6). The times of a window are shown as local times of the date in the zone the
  view names, an end at the midnight that closes the date as "24:00", written as a
  pattern's hours are ("09:00 – 13:00").
- **The day as the weekly patterns give it is computed here**, from the patterns that are
  known, with `shared/`'s `definedWindows(date, patterns, null, [])`: no rule is written a
  second time. The types' names are joined from the types that are known ("Unknown type"
  otherwise). While the patterns could not be read the description says so, and the rest
  of the day works.
- **A view that says no source** (a User's, which cannot arrive here) has a decided
  outcome: the weekly patterns apply, and no window is listed as the day's own or as extra.
- **The same date shown again is read again; another date takes the day on show off.** A
  read that fails is said in the place of the day, with "Try again" (`retry()`), and a day
  that could not be read again is taken off the screen. The same day read again keeps the
  same object. The appointments of the day are not shown: the week shows them.
- **The date on show is read again** after every result of the four writes of a date, a
  failure included (`docs/SHARED_CALENDAR_SPEC.md` section 16.3); after every result of a
  write to a type or to a pattern, since a day follows them (the patterns' description
  follows `known$`, the day as it is now follows the read); and every time the page
  becomes visible. Not for a result that was already there at `start()`, and not while no
  date is on show.
- **The windows of "this day only" are state of this object**, a list kept by start.
  `edit()` starts it from the day on show: the windows of the calendar view that are not
  extra ones, which are the day's own when it has some and otherwise those the weekly
  patterns give it (`startingWindows`). `add(fields)` checks the three fields with the
  sentences of a pattern's form ("End must be later than Start.", "Type must be chosen.")
  and then what only the list can know: **a window that overlaps one of the list is
  refused**: "Start" and "End" are both in fault, and the sentence is said once, under
  "Start" ("Start and End overlap another window of this day. Choose other hours."; the
  refusal of "End" is the empty sentence, `IN_FAULT_TOO`), with `shared/`'s `overlaps`, so windows that touch are accepted
  whatever their types (`docs/SHARED_CALENDAR_SPEC.md` R-AV-01); and **one more than a day
  may have of its own is refused** as the form's failure ("A day can have 10 windows of its
  own at most. Remove one to add another.", the number being
  `CALENDAR_LIMITS.overrideWindowsPerDate`). The list is compared with itself only: an
  overlap with an extra window of the day is the server's to say, at the save.
  `remove(index)` takes one out; `discard()` drops the list; `save()` sends it whole, an
  empty one included, which makes the day not available.
- **After a save that succeeded the list is gone and the day is read again; after one that
  failed it stays**, with the failure in plain words and the appointments in the way when
  the server named some. While the save is under way the list is left as it was sent.
- **"Show" while the list is open is refused** ("Save or discard the changes to this day
  first."), for the same date as for another, with no request; the sentence goes when the
  list is saved or discarded. A list of types that arrives, the page shown again and a
  read of the day that fails each leave the list with its windows (the names follow the
  types). Leaving the screen drops it with no question, like everything typed and not sent.
- **All five writes go through this object**, the three the dialog confirms included. It
  departs from the two deletes of the screen's other parts, which the view calls on their
  services (decision 99), for three reasons: the date is this object's state, not the
  view's; "not available" and the save are the same call, so one place must know whose
  answer arrives; and the appointments in the way need the calendar's zone.
- **What a write says** is an `Ask`, as on the screen's other parts: `add` (refusals and
  the limit, never a call), `save`, `window` (an extra window: its refusals, then its
  call), and `confirm`, whose `about` is `'close'`, `'back'` or the id of the window
  deleted. **One write of a kind at a time**: while a save or "not available" is under way
  neither is taken; while an action of the dialog is under way no other is; while an extra
  window is being added no second one is. "Not available" and the way back are not taken
  while the list of "this day only" is open, and the stream then offers neither.
- **An extra window's body** is the three fields and the date on show (`windowFor`), with
  the two refusals of the fields. An overlap with the day's other windows and the limit of
  10 are the server's to say. After a create that succeeded its form goes back to its
  starting values; after a failure what was chosen stays.
- **The bodies are held to the shared schemas** by the tests: every list the logic makes is
  parsed by `OverrideBody` unchanged, an empty one included, and an extra window's body by
  `OneOffWindowBody`; what the logic refuses for a field, the schemas refuse too.
- **Known limits.** On the night the clocks go forward a day's own window written across
  the missing hour reads back from where the clock resumes ("02:00 – 04:00" as "03:00 –
  04:00", the same real time, `docs/SHARED_CALENDAR_SPEC.md` R-TIME-03), and one that holds
  no time is left out of the list "this day only" starts from. A write of a date answered
  `type_not_found` does not read the types again (this object reads nothing the first one
  reads): the choices are brought up to date by the next write to a type or to a pattern,
  or when the page is shown again.
- **Nothing is told to the week**, which loads at its `start()`.
- **What is kept, and what is not.** Nothing: the end of the subscription of `start()`
  forgets the date, the day, the list and what the forms said.

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
knows the reasons a person can meet: the transport reasons every API service shares
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
**A single date** (`docs/FRONTEND_SERVICES.md` section 17.1) brought three codes.
`date_in_past`, which the page prevents and the server says for a page left open over
midnight: "This date is now in the past, so it can no longer be changed."
`override_not_found`: "This day no longer has windows of its own: the weekly patterns
apply." `window_not_found`: "This extra window no longer exists." And two more values of
the second argument. After `'window'`, `limit_reached` is "A day can hold 10 extra windows
at most. Delete one to add another.", the number being
`CALENDAR_LIMITS.oneOffWindowsPerDate`. After `'patterns-back'`, `availability_overlap` is
"The hours the weekly patterns give this day overlap one of its extra windows. Delete that
extra window first.": the way back chooses no hours, so "Choose other hours." would say
nothing there (`docs/SHARED_CALENDAR_SPEC.md` section 6.5, the last row of its table).
The raw technical text is never shown: a reason without a sentence gets one general sentence,
never the service's `message`, which is written for a developer. The login view uses it too. A
wrong password and an unknown user are one reason and get one sentence. A new route's codes get
their sentences here.

## 6. The shell

The shell is the start-up code, one function called by the entry file of the bundle:
`runShell(config)`, in `frontend/src/views/shell.ts`. It creates what lives as long as the page
(point 1) and calls `mountShell(root, { config, store, login, logout })`, which does the rest and is
what the shell's DOM test drives, with a store, a login and a sign-out service of its own. `mountShell` gets the
API's configuration and the whole store because it creates the API services of each session
(point 4), which read the token from the store at each call.

1. **It creates the `SessionStore`, the `LoginService`, the `RefreshService` and the
   `LogoutService` once**, with the
   configuration (the API's URL, Cognito's URL, the client id), which it receives as one plain
   object and never looks up itself (section 12.1). It starts the automatic refresh
   (`docs/FRONTEND_SERVICES.md` section 11.6). The `LogoutService` is created with the store
   and with the two services before it, which it puts back to their first state at a sign-out
   (`docs/FRONTEND_SERVICES.md` section 20.6); `mountShell` is handed its one method,
   `logout`, beside `login`. It is not one of the objects of point 4: the teardown of the
   person who leaves must not cancel the request that tells Cognito. Ending the shell does
   not end it either: a request under way ends by itself, in 10 seconds at most.
2. **It subscribes to `store.session$`** (`docs/FRONTEND_SERVICES.md` section 9.5). `null` shows
   and mounts the login view. A session hides it and shows the application, with the navigation
   its `role` allows. The application's frame is one element of `index.html` (`#app`): a header
   with the username, the role in words ("Administrator" or "User") and "Sign out", the
   navigation, and the main area where the screens are. The shell fills the header when a person
   enters and empties it when that person leaves. "Sign out" calls `logout()` of the
   `LogoutService` and nothing else (section 13.7): the shell clears nothing itself, waits for
   nothing and shows nothing about Cognito's answer. The screen changes because the service
   clears the `SessionStore` during that call, and `session$` then notifies `null`. A session
   that ends by itself (its expiry, a token rejected) reaches the shell the same way, as a
   `null`, with no call to the service.
3. **A refreshed session is the same person.** The shell reacts only when the username or the
   role changes (`distinctUntilChanged`), so a token refresh leaves the screen as it is. The session is
   reduced to the username and the role before anything else sees it (section 3, rule 11).
4. **New API services and logic objects for every session.** They are created when a session
   starts and dropped when it ends, so that nothing of one person's data can be replayed to the
   next (the services' result streams replay their last value). One function of the shell,
   `sessionObjects`, creates them when a person enters: the `CalendarService`, the
   `AppointmentsService`, the `UsersService` (for both roles; a User's view never calls it),
   the `CalendarSettingsService` (read by the list screen for the time zone, read and saved by
   the settings screen), the `WeekScreen`, the `AppointmentsScreen`, which is given the
   `WeekScreen` for the hand-over of section 5.1, the `SettingsScreen` and the `UsersScreen`,
   which is given the session's `UsersService`, the one the week's book dialog asks for its list, the `AvailabilityTypesService`, the `AvailabilityRulesService` and the `AvailabilityScreen`, which is given both and the session's `CalendarSettingsService`, and the `DateScreen`, which is given the `AvailabilityScreen`'s `known$`, the two availability services and **a second `CalendarService`**, of its own: the service has one pair of streams and one pending call, and `reload()` runs its last range again, so the week's must never be asked for a single date. They live as long as the person's session, not as long as a screen is on
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

There are five entries: `#/week`, "Week", both roles; `#/appointments`, "My
appointments", the role `user` only; `#/settings`, "Settings", `#/users`, "Users", and
`#/availability`, "Availability", the role `admin` only. The dialogs have no address. A new screen is a new entry,
its element in `index.html`, and its services and logic object in `sessionObjects`; the code
that reads the address, fills the navigation and switches between screens does not change: it
was written for the first entry and not touched for the four that followed. `mountShell` takes the table as an optional dependency, which a
test uses to bring an entry whose mount is a spy.

**The fifth entry shows one screen with two views** (`docs/FRONTEND_VIEW_PLAN.md` step 68).
Its `show` mounts the dialog that confirms (`mountConfirm`), then the two views, each
handed that dialog; then it starts the `AvailabilityScreen`, then the `DateScreen`. Views
first, as for every screen (section 3, rule 8). The `AvailabilityScreen` first of the two
objects: its three reads leave at once, in the order they always had, and the `DateScreen`,
which reads nothing at its start, takes what is known as it arrives. The one subscription
holds the five, and ends them in that order.

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
10, open point O3); the login view is shown and mounted. All of it happens inside the one run
of the script, before the browser paints: the first thing a person sees is the login form.

The sequence from "Sign in" to the first week on screen, which no single point above says in
order:

1. The login view's handler calls `login.login(…)` and nothing else. `loginState$` says
   `pending` and the view disables the button.
2. On a success the `LoginService` puts the session in the `SessionStore`; `session$` notifies
   the shell, which reduces it to a person (the username and the role).
3. The shell **leaves the login view first**: it unsubscribes it, and the view's teardown
   resets the form, so the password typed is no longer in the page. Then it hides `#login`
   and shows `#app`.
4. `enter(person)` fills the header, creates the session's services and logic objects
   (`sessionObjects`: nothing is asked of the server yet), and fills the navigation.
5. The address is read. With no hash it becomes `#/week`, in place. The entry's `show` runs:
   it un-hides `#week`, **mounts the view**, which subscribes to `week$` and gets its starting
   state at once (the label of the week, no week, nothing loading), and **then** starts the
   `WeekScreen` (section 3, rule 8).
6. `start()` asks for the week: `week$` says `loading` with the label, and the view shows
   "Loading…".
7. The answer arrives; the `WeekScreen` makes the week ready to draw (`weekModel`) and
   `week$` carries it; the view draws the days from the templates, once for that week object.

Signing out is the same sequence backwards, with a step before it and one after
(section 13.7). The handler of "Sign out" calls `logout()`. The `LogoutService` first puts the
`LoginService` and the `RefreshService` back to their first state, so the login view mounted
a moment later finds no outcome of the person who left. Then the store is cleared,
`session$` says `null`, the shell unsubscribes the person's one subscription, which ends the
logic object's and the view's and runs the view's teardown, hides `#app`, shows `#login` and
mounts the login view on the same, emptied, form. Last, the request that tells Cognito
leaves. All of it is one run of the script, inside the handler: the person sees the login at
once, and Cognito's answer, whenever it comes and whatever it says, changes nothing on the
page.

## 7. The fallback: `lit-html` for a single view

`lit-html` (one function, `render`, and one template tag, `html`) is added **for one view** when
one of these is true for that view:

- it needs input fields inside a region that is redrawn (section 3, rule 4 cannot be kept);
- the code that looks nodes up to react to a second or third stream has become longer than the
  rest of the view;
- someone is about to write a helper that compares what is on the page with what should be
  there, or that makes markup from data without a template (section 3, rule 12). A helper that
  finds elements once, sets their values, texts and attributes, or fills copies of a
  `<template>` is not that.

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

### 7.1 What the code became

Measured at `docs/FRONTEND_VIEW_PLAN.md` step 69 (2026-11-20), with every screen built.

**The views** (`frontend/src/views/`):

| File | Lines | Lines of code | Lines that look a node up or copy a template | Streams listened to | Dialogs wired |
|---|---|---|---|---|---|
| `week.view.ts` | 315 | 227 | 47 | 4 | 1 (the book dialog, in its two modes); it mounts the detail |
| `availability.view.ts` | 213 | 159 | 23 | 3 | 2 (rename, change); it opens the one that confirms |
| `date.view.ts` | 174 | 131 | 18 | 1 | 0; it opens the one that confirms |
| `users.view.ts` | 172 | 121 | 25 | 3 | 2 (the password, the delete) |
| `availability.parts.ts` | 160 | 107 | 19 | 0 | 1 (the one that confirms, `mountConfirm`) |
| `detail.view.ts` | 134 | 89 | 10 | 2 | 1 (the detail) |
| `appointments.view.ts` | 117 | 85 | 19 | 1 | 0; it mounts the detail |
| `settings.view.ts` | 110 | 81 | 16 | 1 | 0 |
| `login.view.ts` | 39 | 23 | 3 | 1 | 0 |
| `shell.ts` | 303 | 221 | 10 | 2 (the session, the address) | 0 |
| **All ten** | **1737** | **1244** | **190** | | **7**, each wired once |

**The page**: `frontend/index.html` is 605 lines: the login, the frame, 5 screens, 7 dialogs,
19 templates, 36 fields, 48 places for a failure or a refusal. `frontend/style.css` is 253
lines.

**The logic layer** (`frontend/src/logic/`):

| File | Lines | Lines of code |
|---|---|---|
| `date.screen.ts` | 382 | 264 |
| `availability.screen.ts` | 358 | 247 |
| `date.model.ts` | 207 | 119 |
| `availability.model.ts` | 196 | 112 |
| `appointments.screen.ts` | 191 | 129 |
| `texts.ts` | 183 | 107 |
| `week.screen.ts` | 181 | 111 |
| `week.model.ts` | 173 | 133 |
| `users.screen.ts` | 140 | 87 |
| `settings.screen.ts` | 123 | 80 |
| `booking.ts` | 97 | 54 |
| `settings.model.ts` | 91 | 54 |
| `appointment.detail.ts` | 90 | 61 |
| `appointments.model.ts` | 80 | 48 |
| `users.model.ts` | 39 | 14 |
| `conflicts.ts` | 28 | 14 |
| **All sixteen** | **2559** | **1634** |

**The logic against the views.** 1634 lines of code in the logic layer against 1244 in the
views and the shell, or 1023 in the views without the shell: the bet of
`docs/FRONTEND_VIEW_PLAN.md` section 4 ("logic first") was that the rules would live in the
logic, and they do. The two screens whose views are longest are also those whose logic is
longest by more: the availability has 547 lines in its two views and their shared file, and
1171 in its four logic files. The services, which the plan did not touch, are 2031 lines (1482
of code).

**The tests** (`npm run test:unit -w frontend`: 2067 tests in 40 files, 100 % of the lines of
`frontend/src`, `src/main.ts` left out):

| Layer | Tests |
|---|---|
| Services (`tests/unit/services/`) | 639 |
| Logic (`tests/unit/logic/`) | 768 |
| Views (`tests/unit/views/`, the shell's file aside) | 539 |
| Shell (`tests/unit/views/shell.test.ts`) | 121 |

**The bundle** (`dist/app.js`, minified; "compressed" is gzip, as the build prints it):

| Plan step | What it added | `app.js` | Compressed |
|---|---|---|---|
| 60 | The login, the shell | 490 kB | 105 kB |
| 61 | The logic layer, the week | 504 kB | 110 kB |
| 62 | Booking and cancelling | 518 kB | 113 kB |
| 63 | The note, the change | 520 kB | 114 kB |
| 64 | "My appointments" | 528 kB | 115 kB |
| 65 | The settings | 532 kB | 117 kB |
| 66 | The users | 537 kB | 118 kB |
| 67 | The types, the weekly patterns | 561 kB | 124 kB |
| 68 | A single date | 575 kB | 128 kB |
| 69 | Nothing of size | 575 kB | 128 kB |

Of the 575 kB at step 69: `zod` 454 kB (79 %; 264 kB of it its messages in other languages,
190 kB the rest), `rxjs` with its helper library 28 kB, `shared/` 6 kB, the services 27 kB,
the logic 36 kB, the views and the shell 24 kB. From step 60 to step 69 the bundle grew by
85 kB, which is all the logic and all the views, the services they brought in, and the parts
of `rxjs` they use. Open point O9 (section 10) is about the 454.

**How each number was counted**, so that it can be counted again the same way:

- *Lines*: `wc -l`. *Lines of code*: the lines that are neither blank nor a comment alone
  (`grep -vE '^\s*(//.*)?$'`).
- *Lines that look a node up or copy a template*: among the lines that are not a comment
  alone, those that match `querySelector`, a call of `find(…)`, `all(…)`, `copy(…)` or
  `form('…')`, `closest(` or `getElementById`. The definitions of those helpers are counted
  too. The figures of the decisions of each step (42, 52, 65, 76, 88, 107, 127) were counted
  by eye and differ from these by one line here and there.
- *Streams listened to*: the calls of `.subscribe(` in the file. *Dialogs wired*: the
  dialogs whose `showModal()` the file calls.
- *The page*: `<dialog`, `<template`, and `input`, `select` and `textarea` elements counted in
  `index.html`; the places for a failure are the elements with `role="alert"`
  (`page.test.ts` holds the last two counts).
- *Tests*: vitest's JSON report (`npx vitest run --project unit --project views
  --reporter=json`), the tests of each file summed by its folder.
- *The bundle*: the build's own printed sizes, in thousands of bytes. *The shares*: esbuild's
  metafile for the same options (`bundleOptions` of `frontend/scripts/bundle.mjs`, `minify`,
  `metafile`), `bytesInOutput` summed by where each input file is.

### 7.2 The verdict on the fallback

**`lit-html` was not added, and no view was rewritten.** What follows was written as a
proposal at `docs/FRONTEND_VIEW_PLAN.md` step 69 and **taken at its review** (2026-11-20):
rule 12 and the third condition above now have the words proposed here (section 11,
decision 137). The conditions quoted in this section are those of before the rewording,
which is what the argument is about.

**The three conditions, and the view that came closest to each.**

| Condition | Closest | How close | Recorded in |
|---|---|---|---|
| Input fields inside a region that is redrawn | `date.view.ts`, the windows of "this day only" | **Not met, by a choice about the screen.** The natural shape of that editor is rows with two times and a type each, added and removed: fields in a redrawn list. It was built as rows with one button and one fixed form that adds (decision 110). Two smaller cases were accepted and named: a fixed list whose choices are rebuilt (the Users of the book dialog, decision 39; the types of the four pattern and window forms, decision 107), never a field that is rebuilt | Decisions 39, 107, 110, 127 |
| The look-ups for a second or third stream longer than the rest of the view | `week.view.ts` | **Far.** 47 of its 315 lines look a node up or copy a template, for four streams; in no view is the share above one line in six | Decisions 42, 52, 65 |
| A helper that builds or updates nodes | `availability.parts.ts` | **Met, read by its letter; not met, read by its reason.** See below | Decisions 107, 122, 127 |

**`availability.parts.ts`, named for what it is.** It is a file of view helpers of our own,
160 lines, imported by two views: `copy`, `choices` and `showConflicts`, which make nodes by
copying a template and filling the copy; `form(…)`, whose `fill` and `say` set values, texts
and one attribute on elements found once; and `mountConfirm`, the wiring of one dialog.
Section 3, rule 12 allows "the two small helpers of section 4 (`find`, `copy`)" and names "a
helper that builds or updates nodes" as the day to use the fallback. `choices` and
`showConflicts` build nodes; `say` updates nodes. By the letter of the rule the third
condition was met at step 67 and more so at step 68, and the two decisions that say "not
met" (107, 127) argued from the reason of the rule instead: what it guards against is a
rendering library of our own, something that takes data and decides what the page should
become. Nothing in the file does that. Every function does what a view does by hand in the
other views (`rowFor` in the users' view is `copy` and three assignments; the settings' view
has `say` as a loop of six lines), for four forms and four lists instead of one.

**Should the rule change, or the code? The rule: it was reworded.**

- *Reword rule 12 to allow what was built* (taken). The words, in the place of
  its last two sentences: "A view may have the two small helpers of section 4 (`find`,
  `copy`). The views of one screen may share a file of helpers that do what a view does by
  hand: find elements once; set their values, texts and attributes; fill copies of a
  `<template>` with `textContent`. Such a helper never decides what is shown (the logic layer
  does), never makes an element other than by copying a template, and keeps no state beyond
  that of rule 10. The day someone wants a helper that compares what is on the page with what
  should be there, or that makes markup from data without a template, is the day to use the
  fallback of section 7 for that view, not to write a rendering library." And the third
  condition of this section in the same words. **Cost:** one paragraph, and a bound that
  no lint rule can hold: the review of a view must. The risk is the slow one, a file of
  helpers that grows a function at a time.
- *Change what was built to fit the rule as written.* Either the functions go back into the
  two views, each with its own copy (about 60 lines written twice, and their tests twice,
  for no line less anywhere), or the availability screen moves to `lit-html`: two views and
  the shared file rewritten (547 lines), about 300 lines of markup moved from `index.html`
  into them, their three test files, the largest of the view layer, rewritten against
  rendered markup, and the first dependency of the view layer. **And it would not fit
  well**: of what the file holds, `lit-html` would replace `copy`, `choices` and
  `showConflicts`, some 25 lines. `form(…)` works on fixed fields whose values must *not* be
  written again at every notification (a value being typed is left alone: section 4), which
  is the opposite of a template rendered from state; and `mountConfirm` is a modal dialog,
  which a template cannot open (this section, above; finding 3 of the trial).

**Was `lit-html` needed anywhere? No, and not adding it was right.** The reasons are in what
the interface turned out to be made of: 7 dialogs and 13 forms, which the plain code handles
directly and a template library does not help with; and redrawn regions that are small lists
of rows with texts and buttons. The week, expected to be the first case, is 315 lines of
which the drawing is about 65: five functions that copy a template and fill it. The trial's
finding that the week is "where `lit-html` pays" was true of its markup, and the week's
markup is 30 lines of `index.html`.

**Which view would need it first, and at what change.** `date.view.ts`, the day the windows
of "this day only" must be edited in place: a row with its two times and its type as fields,
rows that come and go while others are being edited. That is the first condition with no way
round it, and the same would hold for editing a pattern in its row. After it, `week.view.ts`,
if the week gained a second way of being drawn (a month, a day at a phone width) or
appointments that are dragged: the five drawing functions would then be written twice, or
turn into the helper the rule forbids.

**"When to think again altogether", read once more.** The interface is the views of
`docs/SHARED_CALENDAR_SPEC.md` section 16.8, the login and the users: five screens, not
"well beyond". No design system is asked for. So: not now. Two things the last paragraph of
section 7 does not name are worth watching, because they are where the plain approach
already costs something. **The same fields written more than once in the page**: a pattern's
six fields twice (the form and the dialog), a window's three fields twice, a name twice;
plain HTML has no way to say "this again", and a sixth screen with forms like these would
make it a third and a fourth time. **Everything in one page and one test of the shell**: a
change to a screen is checked against the whole page (the shell's test compares whole pages,
`page.test.ts` counts every field), which is what kept one person's data out of the next
person's page, and is also why every step touched the same few files. Neither is a reason to
move today; both would be the first arguments for Svelte on the day the list of screens
grows.

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

**What the tests cannot see is walked in a browser.** `docs/FRONTEND_WALK.md` is one numbered
list of checks through every screen, as a User and as the Administrator, at a desktop and at a
phone width, against a fresh, seeded local stack: **the check to repeat after a later change
to the view layer**. It is made from the browser checks of `docs/FRONTEND_VIEW_PLAN.md` steps 60
to 68, which this section quotes step by step below, and it was run twice, whole, at step 69.
It is a written list a person can follow; the script that ran it in a headless browser is not
in the repository, and no end-to-end test tool is (section 11, decision 130). Its last part
lists what only a person can check: a real switch of tab, a real phone, a screen reader's
voice, the native date picker.

**Reading the page without a mouse** (`docs/FRONTEND_VIEW_PLAN.md` step 69). Four things, the
first and the third held by `page.test.ts` from now on:

- **Every field has its label.** Each of the 36 `input`, `select` and `textarea` elements of
  `index.html` is inside a `<label>` that has words of its own and holds no other field. A
  button whose words do not say what it acts on gets a name from the script, with the words
  of the logic layer: a row's "Delete", "Rename", "Change" and "Remove" (which row), and a
  slot and an appointment of the week (which day). The five "Try again" and the two arrows of
  the week have theirs in the page.
- **Every dialog takes the focus and gives it back**: the table below.
- **Every failure is announced.** The 48 elements that show a failure or a refusal (class
  `error`) have `role="alert"`, and nothing else has; the six "Loading…" have `role="status"`,
  as have three other pieces of news: the appointment being moved, "Settings saved." and the
  message beside the User picker of the book dialog, which can also be a failure (section 11,
  decision 133). The two dialogs that ask are described by their question.
- **Everything is reachable by keyboard.** In the walk's desktop run every action of every
  screen is done once by keyboard only (the checks marked `[K]`): Tab to reach, Enter or the
  space bar to press, typing or the arrow keys in a list, Escape.

**The dialogs and the focus**, as Chromium 159 does it at a desktop width, each dialog opened
by keyboard from the element named (probed at `docs/FRONTEND_VIEW_PLAN.md` step 69; the lines of
the steps below say the same of single cases). No line of the views moves the focus: this is
the native modal `<dialog>`, and one `autofocus` in the page (section 11, decision 134).
**In every dialog Tab stays inside it.**

| Dialog | Opened from | The keyboard is on, when it opens | After "Close", "Keep" or the Escape key | After its action succeeded |
|---|---|---|---|---|
| Book (`dialog.book`), a booking | A free slot | The note; for the Administrator the "For" list | Back on the slot | "Book": on nothing, since the week was redrawn; one Tab: the first slot or appointment of the week |
| Book, confirming a change | A free slot, while moving | The note | Back on the slot | "Change": on nothing (the week was redrawn); one Tab: the first slot or appointment of the week |
| Detail (`dialog#detail`), from the week | An appointment | The note's field; "Close" when the note cannot be edited | Back on the appointment | "Save note" and "Cancel appointment" close it: on nothing (the week was redrawn; after a cancellation the appointment is gone); one Tab: the first slot or appointment of the week. "Change": on nothing, since the appointment's button is disabled while moving; one Tab: the next slot after it |
| Detail, from "My appointments" | A row | The same | Back on the row | "Save note", "Cancel appointment": on nothing (the list was redrawn, or the row is gone); one Tab: the first row. "Change": the week is shown |
| The password (`dialog.created`) | "Create user", or Enter in the field | Its heading, "User created" (`autofocus`): Enter and the space bar do nothing there; one Tab: its button | The Escape key does not close it | Its button: back where the keyboard was, the username field or "Create user" |
| Delete a user (`dialog.delete` of `#users`) | A row's "Delete" | "Keep" | Back on the row's "Delete" | "Delete user": on nothing (the row is gone); one Tab: the first "Delete" of the list |
| Rename (`dialog.rename`) | A row's "Rename" | The name | Back on the row's "Rename" | On nothing (the list was redrawn); one Tab: the first "Rename" of the list |
| Change a pattern (`dialog.change`) | A row's "Change" | "Weekday" | Back on the row's "Change" | On nothing (the list was redrawn); one Tab: the first "Change" of the list |
| The one that confirms (`dialog.delete` of `#availability`) | A row's "Delete", "Not available on this day", "Back to the weekly patterns" | "Keep" | Back on the button that opened it | A type, a pattern or an extra window deleted: on nothing (the row is gone); one Tab: the first button of that list. "Not available": back on its button, which is still there. The way back: on nothing (its button is no longer shown); one Tab: the "Start" list of the form that adds an extra window |

- **Where the keyboard ends on nothing, one more Tab reaches the next sensible thing** in every
  case: the start of the list or of the week that was redrawn, never the top of the page. A
  person who uses a screen reader hears no announcement of where they are until that Tab.
- **Nothing was added to mend it.** Putting the focus back by script (on the row that took
  the place of the one renamed, on the heading of the list after a deletion) would need the
  views to know which row was which across a redraw, which they do not keep today. If one
  case were to be mended first it would be the deletions: after "Delete user" or "Confirm" the
  person is told nothing of the outcome but the dialog closing. It is left, and said here.

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
- **The sign-out in the shell's test** (`docs/FRONTEND_DEPLOY_PLAN.md` step 71). `mounted()`
  hands `mountShell` the real `LogoutService` on the test's store, so every test that presses
  "Sign out" also sends the request that tells Cognito, which the file's `fetch` stub leaves
  unanswered: the page is judged before any answer, as a person sees it. What is the
  shell's own is tested with a service that does nothing (the person then stays: the shell
  clears nothing itself). Under `runShell`: the login is back with Cognito silent, with no
  token in the page, a field or the address; a second person signs in while the first
  one's request is unanswered, and the page does not change when that request ends, whether
  with a 200, a refusal or no network. A session that ends by itself sends nothing. The
  10 seconds, and the request given up, are the service's tests and the browser check.

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

What the tests of a single date rely on (plan step 68), and what was learnt in the browser:

- **The dialog that confirms is real in three tests.** The tests of the two views hand
  their mount function the real `mountConfirm`, mounted on the same page as the shell
  mounts it, and add its subscription to the view's; `availability.parts.test.ts` has what
  neither view can see alone: an opening made after another is the only one told.
- **The view's test builds its states with the logic layer's own functions** (`dayModel`,
  `draftModel`, `conflictList`), so the rows it draws are those a person would see; which
  windows a day has, and every check, are tested in the logic layer.
- **A test of the dialog's kinds runs once per kind** (`describe.each`): the same cases for
  "not available", the way back and an extra window.
- **A count of the fields of `#availability`** is a count over the screen's three parts: the
  availability view's test of what it leaves behind counts the 7 of the part about a single
  date too.
- **A native date field typed by keyboard** (Chromium 159, English): the digits of the
  month, the day and the year one after the other ("11302026"), and Enter in the field
  sends the form. For the browser check only.
- **Where the keyboard is after a row is gone**, in Chromium 159: on nothing after "Remove"
  (the rows were redrawn), and the next Tab goes to the first "Remove" left, then to the
  "Start" list of the form that adds; on nothing after "This day only…" and after the way
  back was confirmed, whose buttons are then no longer shown, and after "Save this day",
  "Add window" and a deletion confirmed; on the "Add" button after "Add"; back on the
  button that opened the dialog after "Keep" and the Escape key, and after "Not available
  on this day" was confirmed, since that button is still there.
- **A button the page does not offer cannot be pressed by a check either.** The first run
  of the check tried to open the dialog with the list of "this day only" open, where the
  day's three buttons are not shown: the script was wrong, the page right.

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
│   │                          # availability.screen.ts, date.model.ts, date.screen.ts
│   └── views/                 # shell.ts and one <name>.view.ts per view: login.view.ts, week.view.ts,
│                              # appointments.view.ts, settings.view.ts, users.view.ts,
│                              # availability.view.ts and date.view.ts, the two views of one screen,
│                              # with availability.parts.ts, what the two share; detail.view.ts,
│                              # the dialog two views mount
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

Not decided. "Blocks" says what cannot be done before the point is settled. O4, O6 and O8 were
decided with `docs/FRONTEND_VIEW_PLAN.md` (its section 2) and are no longer open: their rows
say where the decision is written. Each open row ends with **what is true of it today**
(2026-11-20, every view built and running against the local stack). O1, O2 and O5 were decided on
2026-11-21 (section 13), and O7 was designed and built the same day (`docs/FRONTEND_SERVICES.md` section 20): their rows say so, and what they still block
is the work of `docs/FRONTEND_DEPLOY_PLAN.md`, no longer a decision. Since that plan's step 70
(2026-11-21) the template and the deploy command exist. **Since its step 72 (2026-11-21) the page is
deployed**: the rows below still say "not deployed" and "unproven" where they were written before it;
what the deployment proved is in sections 13.2, 13.3, 13.5 and 13.7, and the rows are brought up to
date at step 73. O9 was measured: `app.js` is downloaded as 121 kB (section 13.5).

| # | Point | Direction, where there is one | Blocks |
|---|---|---|---|
| O1 | **Hosting.** Static files on an S3 bucket behind CloudFront, in its own SAM template (`docs/FOLDER_STRUCTURE.md` section 7) | **Decided: a private bucket behind a CloudFront distribution**, stack `shared-calendar-web`, on the address AWS gives the distribution; deployed by `npm run deploy -w frontend`. Sections 13.1, 13.2 and 13.6. **Today:** written, not deployed: `frontend/template.yaml`, `frontend/samconfig.toml` and `frontend/scripts/deploy.sh` exist and the template passes `sam validate --lint`; no stack `shared-calendar-web` exists. That the account may create a distribution is still unproven | The first deployment, as work: `docs/FRONTEND_DEPLOY_PLAN.md` step 72 |
| O2 | **The CORS gap.** The API answers no cross-origin request (`docs/FRONTEND_SERVICES.md` section 10.3) | **Decided: one origin.** The distribution passes `/api/…` on to the API with the prefix removed, as the dev server does; the API gets no CORS configuration and the back end's template does not change. Section 13.3. **Today:** written in the template (the rule for `/api/*`, the function), run nowhere; the bundle's two addresses are whatever the build is given, so `frontend/src` did not change. That the `Authorization` header arrives is proven by the first sign-in at the deployed page | The first deployment, as work: step 72 |
| O3 | **The session across a reload.** In memory only: a reload means signing in again (`docs/FRONTEND_SERVICES.md` section 9.6) | `sessionStorage` is the candidate named there. Decided with O5. **Today:** a reload shows the login (`docs/FRONTEND_WALK.md` check 101). The screens add to what a reload loses: the address is kept (the hash), but the week on show, the mode and the period of "My appointments", an appointment being moved and everything typed and not saved are in memory only | Nothing: the application works without it |
| O4 | **The bundle command and the dev server**, and with them where the configuration comes from and where the built files go | **Decided: esbuild**, two Node scripts. Sections 12.1 and 12.2 | Nothing any more |
| O5 | **The Content-Security-Policy of the hosting** | **Decided:** `default-src 'self'`, Cognito's address for the login, no frame, no `<base>`; sent by the distribution with three more headers; the dev server sends the same without Cognito's address. `zod`'s probe for `eval` stays reported and harmless. Section 13.4. **Today:** the dev server sends `default-src 'self'; frame-ancestors 'none'; base-uri 'none'`; the login and the week were seen under it, with `zod`'s one report and no other (the whole walk ran under `default-src 'self'` alone, before). The distribution's policy is in the template, sent by nothing yet | The first deployment, as work: step 72 |
| O6 | **The DOM emulation for the views' tests and the coverage of the views** | **Decided: `happy-dom`, and the views inside the 100 % line coverage** of `frontend/src`. Section 12.3 | Nothing any more |
| O7 | ~~**Logout.** Not designed in the services layer~~ **Closed** on 2026-11-21 (`docs/FRONTEND_DEPLOY_PLAN.md` step 71): designed and built, `docs/FRONTEND_SERVICES.md` section 20 | "Sign out" makes the page forget the person at once (the page-wide services back to their first state, the `SessionStore` cleared), then tells Cognito to revoke the refresh token (`RevokeToken`), giving up after 10 seconds; the person is signed out of the page whatever Cognito answers, and sees nothing about it. Section 13.7. **Not yet proven:** the call from the deployed page's address, and the real Cognito's answers | Nothing. The first deployment proves the rest (step 72, point 5) |
| O8 | **The language of the interface** and where its texts are kept | **Decided: English only**, no translation mechanism. Section 12.4 | Nothing any more |
| O9 | **The size of the bundle.** Of the 490 kB of `app.js` at plan step 60, 454 are `zod`, and 264 of those are its messages in other languages, which the interface never shows (section 12.1). **Today:** 575 kB, 128 kB compressed, with every view; `zod` is still 454 kB of it, 79 %, and everything written for this front end (the services, the logic, the views) is 87 kB | Slimming it means changing how `shared/` brings `zod` in (which entry of `zod` its schemas import, or what `shared/` exports to the browser): a change to `shared/`, which the back end uses too, so a decision of its own | The first deployment. Nothing locally |
| O10 | **A domain of our own** for the page, in the place of `<id>.cloudfront.net` | None yet. A certificate for a CloudFront distribution must be made in `us-east-1`, where the organization's policy lets this account do nothing (`docs/AWS_ACCOUNTS.md`); so it starts with that policy, or with another account (`docs/NEW_ACCOUNT.md`). The address is in no committed file and in no token, so a later change costs a deployment and telling the people | Nothing: the page works on the address AWS gives |

**No decision stands between the front end and a deployment any more; the work of
`docs/FRONTEND_DEPLOY_PLAN.md` does.** O1, O2 and O5 are decided (section 13), written at its
step 70 and deployed at its step 72; O7 is closed (its step 71); what only the cloud proves of it is checked at its step 72. O3, O9 and O10
block nothing: O9 is measured again at the first deployment (the page is sent compressed,
128 kB; section 13.5). No view waits for any of them, and none of them needs a view to change.

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
| 106 | A pattern's hours are written "09:00 – 13:00", with spaces around the dash; an appointment's time stays "09:00–10:00" (`rangeText`), also in the conflicts list of the same screen (section 5.1) | The first are two local times of a rule, written as the brief of the step has them; the second is the time of an appointment, as the week and the list write it. Two forms, on purpose (settled at `docs/FRONTEND_VIEW_PLAN.md` step 69) | Yes |
| 107 | No condition of section 7 was met at plan step 67; one came close | `availability.view.ts` is 282 lines (the week's is 312) and listens to three streams; 36 of its lines look a node up or copy a template. No field is in a redrawn region: the rows hold buttons, and the choices of a fixed list are rebuilt, as in the book dialog (decision 39). **What came close**: four forms of one shape gave the view local functions that set values and texts of elements found once (`fill`, `say`, `showConflicts`, `choices`), where the settings had one loop in its subscription. None builds a node or decides anything; they are the same few assignments for four forms instead of written four times. If step 68's per-date editor needs rows of fields that come and go, that is the first condition of section 7, and the step must stop there | |
| 108 | The availability is a fifth entry of the table of screens, with its two services and its logic object in `sessionObjects`; the code that reads the address, fills the navigation and switches between screens did not change (section 6) | Decision 28, for the fifth time | |
| 109 | A single date is chosen on the availability screen: a third part, "A single date", with a native date field and "Show"; no new address and no new link (section 4) | Decided with the Product Owner (`docs/FRONTEND_VIEW_PLAN.md` step 68) | |
| 110 | "This day only" is a list of windows put together on the page, then one save: a row has "Remove" and nothing else, a fixed form adds a window, "Save this day" sends the whole list, "Discard" drops it (sections 4 and 5.1) | Decided with the Product Owner. An override is a list sent whole (`docs/SHARED_CALENDAR_SPEC.md` R-OVR-02), and a row with a field of its own would be the first condition of section 7 (decision 107) | |
| 111 | "Not available on this day" is a button of its own, which asks first and then sends the day's own windows as none; the extra windows stay, and the question says so (sections 4 and 5.1) | Decided with the Product Owner. `docs/SHARED_CALENDAR_SPEC.md` R-OVR-01 and R-OVR-03 | |
| 112 | An extra window is created and deleted, not edited; "edit" as two calls is not built (section 5.1) | Decided with the Product Owner. `docs/SHARED_CALENDAR_SPEC.md` R-ONE-02 allows it and does not ask for it; two calls of which the second can fail need a design of their own (decision 91) | |
| 113 | A date before today, the calendar's, is refused under the date field with no read; while the calendar's time zone is not known "Show" is refused with the failure of the read of the settings (section 5.1) | Decided with the Product Owner. `docs/SHARED_CALENDAR_SPEC.md` R-AV-02: a past date cannot be changed, and the week shows what it had. Without the zone "today" is not known | |
| 114 | Two windows of "this day only" that overlap are refused by the page at "Add", under "Start" and "End"; windows that touch are accepted; nothing but the list's own windows is compared (section 5.1) | Decided with the Product Owner. `docs/SHARED_CALENDAR_SPEC.md` R-AV-01, through `shared/`'s `overlaps`. The extra windows of the day are the server's to compare, at the save | |
| 115 | While the list of "this day only" is open "Show" is refused, for any date; leaving the screen and signing out drop the list with no question (section 5.1) | Decided with the Product Owner. A list can hold several steps of work and is not lost by a slip; what is typed and not saved is lost on leaving, as everywhere (decision 72) | |
| 116 | The dialog that confirms has neutral words for everything it confirms: "Please confirm", "Keep", "Confirm"; the question says what will happen (section 4) | Decided with the Product Owner. It replaces the words of decision 100: "not available" deletes nothing, so "Confirm the deletion" and "Delete" no longer fitted. A row's own button keeps saying "Delete" | |
| 117 | The logic of a single date is a second object, `DateScreen`, with its own stream; the `AvailabilityScreen` gained one output, `known$` (the zone, why it is not known, the types, the patterns), and nothing else (section 5.1) | Decided with the Product Owner. The first object's state, stream and tests did not change; each of the screen's two views listens to one object | |
| 118 | A session has a second `CalendarService`, for the part about a single date (section 6) | One pair of streams and one pending call per service, and `reload()` runs the last range again: a single date asked of the week's service would be the week's next reload | Yes |
| 119 | The day as it is now is read from `GET /calendar` for that date alone; the day as the weekly patterns give it is computed from the patterns known, with `shared/`'s `definedWindows`; "this day only" starts from the windows of the view that are not extra ones (section 5.1) | No route lists the overrides or the one-off windows. No rule is written twice. Starting from the view gives one path for a day with and without its own windows, and what the list starts from is what the server has. Known limit: the night the clocks go forward | The third, yes |
| 120 | All five writes on a date go through the `DateScreen`, the three the dialog confirms included; the dialog shows its outcome from the object's stream, by what it is about (sections 4 and 5.1) | It departs from decision 99. The date is the object's state; "not available" and the save are one call with one result stream; the appointments in the way need the zone | Yes |
| 121 | While the list of "this day only" is open the day's three buttons are not offered, and "not available" and the way back are not taken (sections 4 and 5.1) | The brief of the step offered two of them on every date shown. With a list open, "This day only…" pressed again could only restart it or do nothing, and "not available" would leave a list that no longer starts from the day | Yes |
| 122 | What the screen's two views share is one file, `availability.parts.ts`: the look-up of a form whose fields are checked (`held`, `fill`, `say`), `choices`, `showConflicts`, `copy`, and `mountConfirm`, the dialog, mounted by the entry of the table of screens and handed to both views (sections 4 and 6) | The second view needed the functions the first had as local ones; moved as they were, instead of written twice. The dialog is one element with one button: two mounts would overwrite each other's handlers, so it is mounted once, and an opening is told only by the view that made it | Yes |
| 123 | Both forms that add a window go back to 09:00 to 10:00 with no type chosen after an add that was accepted; the sentence of an overlap is said once, under "Start", and "End" is marked in fault with no sentence of its own (sections 4 and 5.1; decision 129) | Decisions 102 and 103 again. The overlap is of the two fields together. It first stood under both, the same words twice, which a screen reader heard twice; settled at `docs/FRONTEND_VIEW_PLAN.md` step 69 | |
| 124 | On the page a date override is "its own windows" and "this day only", a one-off window "an extra window" (section 4) | The words of the Product Owner's brief for the buttons; "override" and "one-off" are the API's words | Yes |
| 125 | `failureText` gains `date_in_past`, `override_not_found` and `window_not_found`, and two things that can be attempted: `'window'`, for `limit_reached`, and `'patterns-back'`, for `availability_overlap` (section 5.1) | Decision 104 again. The second was not asked by the brief of the step: the general sentence ends with "Choose other hours.", and the way back to the weekly patterns chooses none | The second, yes |
| 126 | A write of a date answered `type_not_found` does not read the types again (section 5.1, known limit) | The `DateScreen` reads nothing the `AvailabilityScreen` reads (decision 117). The person reads "This type no longer exists."; the choices follow the next write to a type or a pattern, or the page shown again | Yes |
| 127 | No condition of section 7 was met at plan step 68; the third came closer | `date.view.ts` is 174 lines and listens to one stream, with 18 lines that look a node up or copy a template; `availability.view.ts` went from 282 to 213 (23 such lines); `index.html` is 601 lines. **First condition**: not met. No row holds a field: the windows of "this day only" are rows with one button, added through a fixed form (decision 110). **Second**: not met. **Third, what came closer**: the functions that decision 107 named as local to one view (`fill`, `say`, `showConflicts`, `choices`) are now a file of 158 lines that two views import, with the look-up of a form and the dialog that confirms beside them. None decides anything or builds a node other than a copy of a template filled with `textContent`, and nothing was added to what they do; but it is a small set of view helpers of our own, for one screen, which section 3, rule 12 allows only as "two small helpers". The verdict is in section 7.2 | |
| 128 | The availability stays one entry of the table of screens, whose `show` mounts two views and starts two logic objects; the code that reads the address, fills the navigation and switches between screens did not change (section 6) | Decision 28 again: the entry is where a screen says how it is shown | |
| 129 | A field can be in fault with no words of its own: the logic layer names it in `refusals` with an empty sentence (`IN_FAULT_TOO`, in `date.model.ts`), `say` marks it and writes nothing under it. The one use is "End" in an overlap among the windows of "this day only", whose sentence stands once, under "Start" (sections 4 and 5.1) | Settled before `docs/FRONTEND_VIEW_PLAN.md` step 69. It is the smallest change: the type of `refusals` did not change, and `say` already marked a field for any sentence, the empty one included, so no line of a view changed; the style sheet already hides an empty refusal. A second map of "fields in fault" beside `refusals` was the alternative, for one case | |
| 130 | The walk is a document of its own, `docs/FRONTEND_WALK.md`: one numbered list of checks a person can do by hand, made from the browser checks of plan steps 60 to 68. It is not a source of truth, and the script that ran it in a headless browser is not in the repository (section 8) | Settled before step 69. `docs/FRONTEND_VIEW_PLAN.md` section 8, decision 6: no end-to-end test tool is in the architecture; the list is what is kept, as the check to repeat after a later change | |
| 131 | A slot and an appointment of the week are named for a screen reader with their day before their own words (`aria-label`, set by the view from the day's label and the button's text) | Found at step 69, reading the page without a mouse: the day of a button is the column it stands in, which a screen reader does not say when the button is reached by Tab. The view joins two texts the logic layer made; nothing is decided there | Yes |
| 132 | The two dialogs that ask before an action are described by their question (`aria-describedby`); each "Try again" says what it reads again (`aria-label`, fixed in the page: there are five, three of them on one screen) | Found at step 69. A screen reader said "Please confirm, Keep" and not what was to be confirmed. Markup only | Yes |
| 133 | The message beside the User picker of the book dialog keeps `role="status"`, although it can hold a failure (the list of Users could not be read) | It also holds "Loading the users…" at every opening; as an alert that would interrupt the dialog's own name each time. A failure there is said when the reader is free, and "Book" stays disabled meanwhile. Every other place of a failure or a refusal is an alert: `page.test.ts` holds the list | Yes |
| 134 | No focus management of our own: where the keyboard is after each close of each dialog is what the browser does, written down in one table (section 8). Where it ends on nothing, the next Tab continues from where the element was | The platform before anything of our own (section 3, rule 12). In every case found the next Tab reaches the next sensible thing; moving the focus by script would be state the views do not have today, in ten files | |
| 135 | The verdict on the fallback was written as a proposal (section 7.2) and taken at the review (decision 137): no condition of section 7 called for `lit-html`; `availability.parts.ts` meets the third condition by its letter and not by its reason; rule 12 should be reworded to allow what was built. Nothing was added or rewritten for it | Settled before step 69 that the verdict is proposed here and taken at the review, and that whatever it is, a view that should move is a step of its own | |
| 136 | The trial's code, `prototypes/`, is deleted. Of its page on the loading sequence, three things that were still true of `frontend/` and said nowhere are in this document: why nothing shows before the script decides (section 3, rule 2), the handlers of a view that was left (section 4), and the sequence from "Sign in" to the first week, as a numbered list (section 6). Its diagram was not kept | `docs/FRONTEND_VIEW_PLAN.md` step 69. The rest of that page described the trial's own files, or said what sections 4, 6 and 12 already say (the selectors as the contract, `hidden` as the switch, a module script being deferred, the dev server and what it answers). The one diagram, from the request of the page to the login form, says nothing that the last paragraphs of section 6 do not | |
| 137 | Section 3, rule 12 and the third condition of section 7 are reworded: the views of one screen may share a file of helpers that find elements once, set their values, texts and attributes, and fill copies of a `<template>` with `textContent`; such a helper never decides what is shown, never makes an element other than by copying a template, and keeps no state beyond rule 10's. The fallback is for the day a helper would compare the page with what it should be, or make markup from data without a template | Decided at the review of `docs/FRONTEND_VIEW_PLAN.md` step 69, as section 7.2 proposed. `availability.parts.ts` met the old words by their letter and not by their reason; changing the code to fit them meant some 60 lines written twice, or a move to `lit-html` that would replace about 25 lines. The bound is the review's to hold: no lint rule can | Yes |
| 138 | The page is hosted as static files in a private S3 bucket behind a CloudFront distribution, in a stack of its own, `shared-calendar-web` (section 13.2) | `docs/FOLDER_STRUCTURE.md` section 7 fixed it in principle. HTTPS with nothing to run, patch or pay for at this size; a release of the page never changes the back end's stack | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 139 | One origin: the distribution passes `/api/…` on to the API, the prefix removed by a CloudFront Function; no CORS configuration on the API (section 13.3) | The deployed page then calls the API exactly as the local one does, the back end's template does not change, and the Content-Security-Policy needs no API address. The other way (a `CorsConfiguration` naming the page's origin) would make each stack need a value of the other | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 140 | The login and the refresh go to Cognito directly, not through the distribution | Cognito answers a browser from any origin already. Passing it through would be a second rule to keep right, for a password to cross one service more. It costs one address in the Content-Security-Policy | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 141 | The distribution replaces no failure with `index.html` and keeps no failure of the API (section 13.3, rules 2 and 3). Corrected at `docs/FRONTEND_DEPLOY_PLAN.md` step 70: nothing is set for it, the cache policy `CachingDisabled` is enough (decision 154) | The navigation is the hash, so no path but `/` needs the page; and a failure kept for ten seconds could be one person's refusal given to another, since the cache's key names no header | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 142 | The bucket's policy names the four objects, not `…/*` (section 13.2) | The hard rule of `CLAUDE.md` (no wildcard resource) holds for the bucket too, and it can: the build writes four files with fixed names. A fifth file is a change to the template, on purpose | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 143 | The address is the one AWS gives the distribution; no domain of our own (open point O10) | It works today and needs no certificate. A certificate for CloudFront must be made in `us-east-1`, which the organization's policy blocks for this account | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 144 | The Content-Security-Policy of section 13.4; `frame-ancestors 'none'` and `base-uri 'none'` beside what the dev server sent until now; the dev server sends the same words without Cognito's address | The walk then runs locally under what the deployed page gets. The two additions cost nothing: the page is shown in no frame and has no `<base>` | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 145 | Every file is uploaded with `Cache-Control: no-cache`; the names stay fixed; the deploy command invalidates `/*` (section 13.5) | A name with a hash in it would mean rewriting `index.html` at build time, which is copied as it is and tested as it is. Three small files asked again at each load is a price nobody notices | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 146 | The source map is uploaded with the three files | The repository is public, so the map tells nothing new, and a failure in a person's console can then be read | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 147 | `npm run deploy -w frontend` stands behind the back end's gate (`backend/.verify-ok`), runs the front end's own `verify` itself, and the gate's check becomes one file both deploy scripts use (section 13.6, point 1). Since `docs/FRONTEND_DEPLOY_PLAN.md` step 70 that `verify` ends with `sam validate --lint` of the hosting's template (decision 157) | The gate's promise is "what is deployed is a committed, checked state of the repository" (`docs/FOLDER_STRUCTURE.md` section 4.5), and there is one history. The stamp is written before the front end's checks run, so it does not prove them; they need no Docker and take a minute | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 148 | The deploy command reads `ApiUrl` and `UserPoolClientId` from the back end's stack and builds with them; nothing of a deployment is in a committed file (section 13.6, points 2 and 5) | `docs/FOLDER_STRUCTURE.md` section 7; the repository is public. It also fixes the order: the back end first | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 149 | The deploy command ends with four checks made with curl and no credentials; the signed-in call is proven by the walk's first login (section 13.6, point 8) | A script that signs in would need a password. The four checks prove the bucket, the headers, the rule for `/api/*`, the function and that a failure of the API arrives as the API sent it | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 150 | The size of the bundle (O9) does not block the first deployment | It is sent compressed: 128 kB, once per load of the page, answered "not changed" afterwards. Slimming it is a change to `shared/`, which the back end uses too: a decision of its own, and not one to take in a hurry before a release | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 151 | No root `deploy` script that runs both deployments; the order is a procedure of `docs/RUNBOOK.md` | The back end's deploy takes arguments of its own and asks to confirm a change set; the page is released alone more often than with the API | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 152 | "Sign out" signs the person out of the page at once and then tells Cognito to revoke the refresh token; what Cognito answers, or that it does not answer, changes nothing of the sign-out (section 13.7). ~~Version 13: "revokes the refresh token and signs the person out of the page whatever Cognito answered", in that order~~ | A failed revocation must not keep someone signed in on a shared computer, and neither must a slow one: with the old order a dead network kept the person's frame on screen for as long as the request lasted. The access token's last minutes are the limit already accepted for a deleted user (`docs/ARCHITECTURE.md` section 7.3) | Yes: decided with brief `prompts/93-deploy-frontend.md`; the order decided with the user before the design of step 71 (`docs/FRONTEND_SERVICES.md` section 8, decision 47) |
| 153 | No logs of the distribution, no firewall, no second environment, no pipeline (section 13.8). ~~The API's access log shows CloudFront's address for the page's calls~~ **Corrected at the first deployment (2026-11-21):** the log shows the caller's own address for a call made through the page (section 13.3) | Each is a cost or a thing to keep for a question nobody has asked yet. The table of section 13.8 says when each would come | Yes: decided with brief `prompts/93-deploy-frontend.md`, for review |
| 154 | The distribution has no `CustomErrorResponses` at all. Version 13 of this document asked for one entry per status CloudFront keeps, with the time at zero | AWS's page on the failures CloudFront keeps says: "If you're using the CachingDisabled managed cache policy, CloudFront won't cache these status codes or custom error pages." The entries would have done nothing on `/api/*`, and they belong to the whole distribution, so their one effect would have been on the files' rule. The page also says which failures are kept where caching is on: 404, 414 and 500 to 504 always, 400, 403 and 405 only when the origin says for how long, 401 never. Proven at the first deployment by a 404 asked twice, which the API must answer twice (`docs/FRONTEND_DEPLOY_PLAN.md` step 72, point 5) | Yes: found at `docs/FRONTEND_DEPLOY_PLAN.md` step 70, taken before the template was written |
| 155 | `frontend/template.yaml` has no `Transform` line: it is plain CloudFormation, which `sam validate` and `sam deploy` read as it is. `frontend/samconfig.toml` names no bucket for artifacts (`resolve_s3`) and no `capabilities`, and sets `fail_on_empty_changeset = false` | Nothing in it is one of SAM's short forms. SAM CLI sends a template with nothing to package and under 51,200 bytes as it is (read in the source of SAM CLI 1.171.0, `samcli/commands/deploy/deploy_context.py`; not tried by deploying), so no managed bucket is created for it; it creates no role. A release of the page that changes no resource must go on to the upload | |
| 156 | The deploy command takes one argument, `--dry-run`, and refuses any other; it passes the stack's name, the region and the template to `sam deploy` itself. After a build it refuses to upload a bundle that holds `localhost` or lacks Cognito's address. The third and fourth checks ask for the API's exact answers: 401 `{"message":"Unauthorized"}` and 404 `{"message":"Not Found"}`, as JSON | The back end's deploy hands its arguments to `sam deploy` because its first deployment needs a parameter; this one reads its only parameter itself, so an argument could only point it somewhere else. The two answers were read from the API's own address on 2026-11-21, without credentials | |
| 157 | `npm run verify -w frontend` runs `sam validate --lint` on the template, last, and so needs the SAM CLI; without it the last step fails and says that `sam` is not found. It does not go through `backend/scripts/check-sam.sh` | The root `verify` already needs the SAM CLI for the back end, and a template that lint refuses must not reach a deployment. The minimum version of `check-sam.sh` is about `sam build` in a monorepo (`docs/FOLDER_STRUCTURE.md` section 4.3), which this template never needs. The price: a machine with node alone can no longer run the front end's whole `verify`; `typecheck`, `lint` and `test:unit` still run there one by one | |
| 158 | The header `Strict-Transport-Security` names no sub-domain and asks for no preload; the bucket has `ObjectOwnership: BucketOwnerEnforced`; the resources that need a name carry the stack's (`shared-calendar-web-bucket`, `-strip-api-prefix`, `-headers`) | The address is `<id>.cloudfront.net`, which has no sub-domain of ours. The ownership setting turns the per-object permission lists off, so the bucket's policy is the only grant; it is S3's default for a new bucket, written down. The names must be free in the account | |

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
them from the stack's outputs, are in section 13.6.

The build prints the size of each file, as it is and compressed. At plan step 60, with the login
only: `app.js` 490 kB, 105 kB compressed. Of the 490 kB, 454 are `zod` (264 of them its messages
in other languages), which `shared/`'s schemas bring in with any import from
`@shared-calendar/shared`; the services, `shared/`, the views and `rxjs` together are 36 kB.
At plan step 61, with the logic layer and the week: `app.js` 504 kB, 110 kB compressed. At plan
step 62, with booking and cancelling: 518 kB, 113 kB compressed. At plan step 63, with the note
and the change: 520 kB, 114 kB compressed. At plan step 64, with "My appointments": 528 kB,
115 kB compressed. At plan step 65, with the settings: 532 kB, 117 kB compressed. At plan step 66, with the users: 537 kB, 118 kB compressed. At plan step 67, with the types and the weekly patterns: 561 kB, 124 kB compressed. At plan step 68, with a single date: 575 kB, 128 kB compressed. At plan step 69, which added nothing of size: 575 kB, 128 kB compressed (575,102 bytes, 127,546 compressed), of which `zod` is 454 kB, measured again. The sizes step by step and the shares are one table in section 7.1. What to do about `zod`'s share
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
- It sends `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'none'`
  with the page (the deployed page's policy without Cognito's address, section 13.4) and
  `cache-control: no-store` with every answer. Since no site may show the page in a frame, a
  preview pane that is itself a frame inside an editor stays empty: the page is opened in a
  browser tab, the forwarded port of a Codespace included. Seen on 2026-11-21 through a
  Codespace's forwarded address, in a browser tab ("Open in Browser" in the editor's list of
  ports, then "Continue" on GitHub's notice about a development port): the login, then the
  week, under this policy.
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
  everything hidden at the start, and what a person without a mouse needs of it (section 8).
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
"Close", "Keep", "Delete") are in the page; since plan step 68 the dialog that confirms
says "Please confirm", "Keep" and "Confirm". Those of a single date are made by the logic
layer too (`date.model.ts`): the refusals of the date, the date in words, the sentences of
the day (which of the three it is, that the patterns give no hours, that there is no extra
window, that no window is left), the refusals of a window, the names of a row's button and
the three questions; its fixed words ("A single date", "Date", "Show", "As the weekly
patterns give it", "As it is now", "This day only…", "Not available on this day", "Back to
the weekly patterns", "This day only", "Start", "End", "Type", "Add", "Discard", "Save this
day", "Extra windows", "Add window", "Remove", "Delete") are in the page. The words that name an appointment being moved come from the logic layer
(`movingOf`); the fixed words around them ("Moving: … Choose a free time.", "From:", "To:") are
in the page. No view shows the `message` of a
service. The shell holds the two names of the roles.

---

## 13. The hosting and the deployment (open points O1, O2 and O5, decided)

Decided on 2026-11-21 (brief `prompts/93-deploy-frontend.md`); the order of work is
`docs/FRONTEND_DEPLOY_PLAN.md` (steps 70 to 73). **Written at its step 70:**
`frontend/template.yaml` and `frontend/samconfig.toml` (section 13.2 to 13.5),
`frontend/scripts/deploy.sh` and `scripts/deploy-gate.sh` (section 13.6). **Deployed at its
step 72 (2026-11-21):** the stack `shared-calendar-web` exists, with the six resources of
section 13.2, and the page is in use at the address of its output `PageUrl`; the record of
that deployment is `docs/RUNBOOK.md` section 5.5. What this section said on the strength of
AWS's documentation alone is now marked, where it stands, as proven, as corrected, or as not
yet looked at; the rest of its wording is brought to the present tense at step 73. Logout
(section 13.7) was step 71 and is built. Where a step finds the section wrong, the step stops
and proposes the change here; step 70 did once (section 13.3, rule 3), and step 72 found one
sentence wrong (section 13.3, the access log's `ip`).

### 13.1 What a person's browser talks to

One address for the page and for the API, and Cognito for the login:

```
browser ──► https://<id>.cloudfront.net/            the distribution (CloudFront)
              │   /, /index.html, /style.css,
              │   /app.js, /app.js.map       ──►  the bucket (S3, private): the built files
              │   /api/…                     ──►  the API (API Gateway), the "/api" removed
              │
        ──► https://cognito-idp.<region>.amazonaws.com/    the login and the refresh, directly
```

- **CloudFront** is the AWS service that answers at an HTTPS address and fetches what it
  answers from somewhere else: here from a bucket of files and from the API. A *distribution*
  is one such address with its rules.
- The page's address is the one AWS gives the distribution, `https://<id>.cloudfront.net`. It
  comes with a certificate: nothing to buy, nothing to renew. A domain of our own is open
  point O10.
- The page calls the API at `/api/…` of its own address, exactly as it does under the dev
  server (section 12.2). So the browser sees **one origin** and asks no cross-origin question:
  the API needs no CORS configuration, and `backend/template.yaml` is not changed (O2).
- The login (`InitiateAuth`) and the refresh go straight to Cognito, which answers a browser
  from any origin (`docs/FRONTEND_SERVICES.md` section 10.3). They are not passed through the
  distribution: a password then crosses one service less.

Where the deployed page and the local one differ, and nowhere else:

| | Under the dev server | Deployed |
|---|---|---|
| The page's files | Read from `frontend/`, `app.js` bundled at every request | The files of `frontend/dist/`, in the bucket |
| `API_URL` | `/api`, passed on to `http://127.0.0.1:3000` | `/api`, passed on to the API of the stack `shared-calendar-api` |
| `COGNITO_URL` | `/cognito/`, passed on to cognito-local | `https://cognito-idp.<region>.amazonaws.com/` |
| `CLIENT_ID` | From `backend/env.local.json` | The output `UserPoolClientId` of the back end's stack |
| Content-Security-Policy | Section 13.4, without Cognito's address | Section 13.4 |

### 13.2 The stack `shared-calendar-web`

One SAM template, `frontend/template.yaml`, and one stack, `shared-calendar-web`, in
`eu-north-1`, beside the back end's and never part of it (`docs/FOLDER_STRUCTURE.md`
section 7). It holds no function of Lambda, no table and no role. The template is plain
CloudFormation, with no `Transform` line: nothing in it is one of SAM's short forms
(section 11, decision 155). Its six resources, in plain words:

| Resource | What it is | What is set |
|---|---|---|
| The bucket (`AWS::S3::Bucket`) | Where the four built files lie | Private: every kind of public access blocked, no web-site mode, encrypted at rest with S3's own key, the per-object permission lists off. Its name is left to CloudFormation. It is created empty; the stack cannot be deleted while it holds files |
| The bucket's policy (`AWS::S3::BucketPolicy`) | Who may read the files | The CloudFront service, for this one distribution only (a condition on the distribution's ARN), action `s3:GetObject`, on **the four objects by name**: `index.html`, `style.css`, `app.js`, `app.js.map`. No wildcard (`CLAUDE.md`, hard rules) |
| The origin access control (`AWS::CloudFront::OriginAccessControl`) | How the distribution proves to S3 that it is the one asking | Requests to the bucket are signed (SigV4), always |
| The function (`AWS::CloudFront::Function`) | A few lines of JavaScript that CloudFront runs on a request for `/api/…` before passing it on | It removes the first four characters of the path (`/api`), and does nothing else; a path that is then empty becomes `/`. Its code, five lines, is in the template (runtime `cloudfront-js-2.0`); it holds no value of a deployment and has no test of its own: the deploy command's third and fourth checks prove it |
| The headers (`AWS::CloudFront::ResponseHeadersPolicy`) | What the distribution adds to every answer | Section 13.4 |
| The distribution (`AWS::CloudFront::Distribution`) | The address, and the rules of section 13.3 and 13.5 | HTTP is redirected to HTTPS; `index.html` answers `/`; the files are sent compressed; the cheapest price class (Europe and North America); HTTP/2 and HTTP/3, IPv6; the API reached over HTTPS only, TLS 1.2; no alias, no logging |

One parameter, `ApiDomain`: the host name of the back end's API (`<id>.execute-api.<region>.amazonaws.com`),
which the deploy command reads from the back end's stack (section 13.6); the template refuses a
value that is not a host name alone (a `/` or a `:` in it). Three outputs: `PageUrl`,
`BucketName`, `DistributionId`. The three managed policies are named by their ids, as read on
AWS's pages on 2026-11-21: `CachingDisabled` `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`,
`CachingOptimized` `658327ea-f89d-4fab-a63d-7e88639e58f6`, `AllViewerExceptHostHeader`
`b689b0a8-53d0-40ab-baf2-68738e2966ac`.

The stack is created from `eu-north-1` like the other. CloudFront itself is a global service:
it has no region to choose. The organization's policy allows regional services in `eu-north-1`
only (`docs/AWS_ACCOUNTS.md`); on 2026-11-21 a read-only `aws cloudfront list-distributions`
under the profile `shared-calendar-admin` was answered, not refused. **The account may also
create one: the first deployment did** (2026-11-21, `docs/FRONTEND_DEPLOY_PLAN.md` step 72;
the stack was complete three and a half minutes after the change set was confirmed).

### 13.3 The API through the page's address

The distribution has two rules (*cache behaviours*), chosen by the path:

| Path | Goes to | Methods | Kept by CloudFront | Passed on |
|---|---|---|---|---|
| `/api/*` | The API, over HTTPS | All seven | Never (managed cache policy `CachingDisabled`) | Every header of the browser except `Host`, the query string, the body (managed origin request policy `AllViewerExceptHostHeader`); the path without `/api` |
| Everything else | The bucket | `GET`, `HEAD` | Section 13.5 | Nothing of the browser's headers |

Rules that are easy to break:

1. **The `Authorization` header must reach the API.** CloudFront removes it unless told
   otherwise; a policy that passes on all the browser's headers passes it on too, and one
   cannot name it alone in a policy of one's own. `Host` is the one header not passed on: API
   Gateway finds the API by it, and it must be the API's own. AWS's pages say of
   `AllViewerExceptHostHeader` that it is "intended for use with Amazon API Gateway" and passes
   on every header but `Host`; where they speak of `Authorization` they name its sibling
   `AllViewer`. So the first sign-in at the deployed page was the proof. **Proven on
   2026-11-21:** the Administrator and a User signed in at the page and the API answered
   their calls 200 and 201 through the distribution (the week, the users, the availability,
   bookings), each of which the authorizer lets through only with the token; seen on the
   page and in the API's access log.
2. **No answer of the API is replaced.** The distribution has no "custom error response" that
   swaps a 403 or a 404 for `index.html`, the usual trick of a single-page application. The
   page needs none (its navigation is the URL's hash, section 6), and the trick would turn the
   API's refusals into a page of HTML.
3. **No answer of the API is kept, a failure neither**, so a refusal given to one person is
   never the answer to the next. Nothing is set for it beyond the rule's cache policy: where
   caching is on, CloudFront keeps some failures of an origin for ten seconds (404, 414 and 500
   to 504 always; 400, 403 and 405 only when the origin says for how long; 401 never), but
   AWS's page says: "If you're using the CachingDisabled managed cache policy, CloudFront won't
   cache these status codes or custom error pages." So the distribution has no
   `CustomErrorResponses` at all, which is also what rule 2 asks (section 11, decision 154).
   **Proven on 2026-11-21:** `/api/no-such-route` asked twice within a second answered 404
   twice with two different `apigw-requestid` headers: the API answered both, nothing was
   kept.
   On the files' rule the bucket answers 403 for any name that is not one of the four files
   (listing is not granted, so S3 does not say 404; seen at the first deployment, with S3's
   own XML and the four headers of section 13.4), which CloudFront does not keep either;
   whatever it did keep there would be the same answer for everybody, and nobody's data.
4. The function touches the path only. It reads no header and no body.

What this changes for the API, and what it does not:

- **The API keeps its own address** (`ApiUrl`), and answers there as before: the smoke test,
  the curl examples of `README.md` and the scripts use it. It was never a secret: every one of its
  routes asks for a token.
- **The access log's `ip`** (`backend/template.yaml`, `AccessLogSettings`) **is still the
  caller's own address for a call made by the page**, not CloudFront's. Versions 13 to 16 of
  this document said the opposite; the first deployment showed it (2026-11-21: the calls
  made with curl through the page's address were logged with the address of the machine that
  made them). Nothing had to change for it. Also seen there: a request for a path that is no
  route of the API (answered 404) leaves no line in the access log.
- The API's throttling (burst 10, 5 a second) is for the whole API, as before: the page's
  calls and direct calls share it.
- CloudFront waits 30 seconds for an origin; the API's functions answer or fail well inside
  that.

### 13.4 The headers sent with the page (O5)

One response headers policy, on both rules, so every answer carries the same:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; connect-src 'self' https://cognito-idp.<region>.amazonaws.com; frame-ancestors 'none'; base-uri 'none'` | The page loads its script and its style from its own address and nowhere else, and calls its own address and Cognito only (section 3, rule 6: nothing inline). No other site may show it in a frame |
| `Strict-Transport-Security` | `max-age=31536000` (no sub-domains, no preload) | A browser that has been here once never asks over plain HTTP again |
| `X-Content-Type-Options` | `nosniff` | A file is what its type says |
| `Referrer-Policy` | `no-referrer` | The page's address is told to nobody |

- The region in the policy is the stack's own (`AWS::Region`): the user pool is in the same
  region as the hosting stack, and the deploy command builds `COGNITO_URL` from the same
  value; it stops when the two `samconfig.toml` files name different regions.
- Each of the four is set to win over a header of the same name from the bucket or the API
  (neither sends one).
- **The dev server sends the same policy without Cognito's address**, which it does not need
  (`connect-src` is then left out and `default-src` decides): the walk
  (`docs/FRONTEND_WALK.md`) runs locally under the words the deployed page gets. It sends the
  policy only, not the other three headers, which are about HTTPS and other sites.
- `zod`'s probe for `eval` is still reported once in the console under this policy. It is
  caught and harmless (section 12.2); `'unsafe-eval'` is not added to silence it.

### 13.5 The files and their caching

The bucket holds four objects and never a fifth: the three files of the page and the source
map (the repository is public, so the map tells nobody anything new, and it makes a failure
in the console readable).

The files' names are fixed (`app.js`, not `app.3f9a….js`): `index.html` is copied as it is
(section 12.1) and `page.test.ts` holds it to one script and one style sheet by those names.
So no file may be kept by a browser without asking:

- Every object is uploaded with `Cache-Control: no-cache`: a browser keeps its copy but asks,
  at every load, whether it is still the newest, and gets a short "not changed" when it is.
- CloudFront keeps the files (managed cache policy `CachingOptimized`) and, since the files
  say `no-cache`, asks the bucket again as well, once its copy is a second old (that policy's
  shortest time, which `no-cache` does not undo). After an upload the deploy command also
  empties CloudFront's copies (an *invalidation* of `/*`), so that a release is there at once
  and not a moment later.
- An upload is four files one after the other, `index.html` last. A person who loads the
  page in those seconds may get the new script with the old page; a reload ends it. Accepted
  at this size.

`app.js` is sent compressed. **As downloaded from the deployed page** (2026-11-21, with
curl, which a browser's network panel shows with a few hundred bytes of headers more):

| File | As built | Downloaded (Brotli, what a browser gets) | With gzip only |
|---|---|---|---|
| `index.html` | 30,677 bytes | 5,095 | 5,398 |
| `style.css` | 16,676 | 4,578 | 4,897 |
| `app.js` | 578,155 | 121,188 | 130,771 |

CloudFront chooses Brotli for a client that accepts it, which every current browser does. So
a first load of the page is about 131 kB, and a later one three short "not changed" answers.
Slimming `app.js` stays open point O9, which did not block the deployment (section 11,
decision 150). The source map (2.2 MB) is fetched only by a browser whose developer tools
are open.

### 13.6 The deploy command

`npm run deploy -w frontend` (`frontend/scripts/deploy.sh`), a real cloud action: only when
explicitly asked (`CLAUDE.md`, cloud safety). The same command for the first deployment and
for every release. Its one argument is `--dry-run` (below); any other is refused. In order,
stopping at the first failure and naming it:

1. **The gate**, the same as the back end's (`docs/ARCHITECTURE.md` section 8.1):
   `backend/.verify-ok` younger than 30 minutes, naming HEAD, written on a clean tree, and the
   tree still clean. The check is one file both deploy scripts use
   (`scripts/deploy-gate.sh`), not two copies. The stamp proves the back end and `shared/`;
   the front end's own checks (`npm run verify -w frontend`: typecheck, lint, unit tests, and
   `sam validate --lint` of the hosting's template; no Docker, about a minute) are run by the
   command itself, here, before anything is read from AWS.
2. **Read the back end's stack** (`shared-calendar-api`, the name in `backend/samconfig.toml`;
   read-only `describe-stacks`, as `backend/scripts/target.sh` does): `ApiUrl` and
   `UserPoolClientId`. A missing stack or output stops the command and is named. So the back
   end is deployed first, always.
3. **`sam deploy`** of `frontend/template.yaml` with `ApiDomain` = the host of `ApiUrl`
   (`frontend/samconfig.toml` holds the stack's name and region, nothing of a deployment). The
   change set is shown and confirmed, as for the back end. On a release that changes no
   resource it says so and goes on (`fail_on_empty_changeset = false`). There is no `sam build`
   (the template has no code) and no bucket for artifacts (section 11, decision 155).
4. **Read its own stack**: `BucketName`, `DistributionId`, `PageUrl`.
5. **Build**: `npm run build -w frontend` with `API_URL=/api`,
   `COGNITO_URL=https://cognito-idp.<region>.amazonaws.com/` and `CLIENT_ID` in the
   environment. No value of a stack is written in a committed file. The command then
   refuses to go on if one of the four files is missing or empty, if `app.js` holds
   `localhost`, or if it lacks Cognito's address.
6. **Upload** the four files of `frontend/dist/` by name (four `aws s3 cp`, never a `sync`,
   never a delete), each with its content type and `Cache-Control: no-cache`, `index.html`
   last.
7. **Invalidate** `/*`, and wait until CloudFront says it is done.
8. **Check**, with curl and no credentials, PASS or FAIL each: `/` answers 200 with the
   Content-Security-Policy of section 13.4; `/app.js` answers 200 as JavaScript; `/api/calendar`
   answers 401 with the API's own JSON, `{"message":"Unauthorized"}` (the rule for `/api/*`,
   the function and the API are in line); a path that is no route, `/api/no-such-route`,
   answers 404 with the API's JSON, `{"message":"Not Found"}`, and not with a page. All four
   run; one FAIL makes the command end with 1.
9. Print `PageUrl`.

**`--dry-run`** does points 1, 2 and 5 and says what points 3, 4 and 6 to 8 would do, with the
names it knows (the hosting stack's, if it exists already: one more read). It creates and
changes nothing in the cloud. It passes the gate like a real run: there is no switch that
skips the gate.

What the command never does: it takes no password and no token (so it cannot prove a
signed-in call: the first login of the walk does); it never touches the stack
`shared-calendar-api`; it refuses a stack name given for the back end that is the old
`hello-world-api`.

**The deployment process**, then (`docs/RUNBOOK.md` gets it at step 72):
`npm run verify` → `npm run deploy -w backend` → the smoke test → `npm run deploy -w frontend`.
A release of the page alone is `npm run verify` and the last command. There is no root
`deploy` script that runs both: the back end's deploy takes arguments of its own and asks to
confirm a change set, and the two are released apart more often than together.

### 13.7 Logout (O7)

Built at `docs/FRONTEND_DEPLOY_PLAN.md` step 71. `docs/FRONTEND_SERVICES.md` section 20 is the
truth for the service (`LogoutService`); here is what it means for the page.

"Sign out" does two things, in this order:

1. **The page forgets the person, at once.** The `SessionStore` is cleared, so the login
   shows, and the two services that live as long as the page (login, refresh) are put back
   to their first state, so that nothing of the person is left in a service either.
2. **Then Cognito is told** to revoke the refresh token (`RevokeToken`). The request is given
   up after 10 seconds.

Version 13 of this document had the two the other way round ("first revokes, then clears").
With that order a slow or dead network would have kept the person's frame on screen while
Cognito was waited for. The order above was decided before the design (section 11, decision
152).

- **The person is signed out of the page whatever Cognito answers, and also when it does not
  answer.** A failed revocation must not keep someone signed in on a shared computer; what
  is then left is the refresh token at Cognito, for at most its seven days, held by nothing
  in the page.
- **The person sees the login and nothing else**: no "signing out…", no message when the
  revocation fails. The failure is in the service's result, for a developer and for the
  tests; no view reads it.
- **Only "Sign out" tells Cognito.** A session that ends by itself (its expiry, a token the
  API rejected, a renewal Cognito refused) clears the store and sends nothing: it is like a
  tab that is closed, which no code sees (`docs/FRONTEND_SERVICES.md` section 20.6).
- **Only this sign-in is ended.** The same person signed in on another computer stays signed
  in there.
- **A tab closed straight after the press** still tells Cognito: the request is sent so that
  the browser finishes it without the page (`keepalive`; `docs/FRONTEND_SERVICES.md` section
  8, decision 56). Not something a test here can show.
- `RevokeToken` needs no AWS credentials and, for an app client without a secret, nothing but
  the refresh token and the client id: confirmed on AWS's pages on 2026-11-21
  (`docs/FRONTEND_SERVICES.md` section 20.1, with the addresses). The app client already
  allows it (`EnableTokenRevocation`, `backend/template.yaml`). The back end did not change.
- The policy of section 13.4 already allows the call: it goes to Cognito's address, like the
  login. Under the dev server it goes to `/cognito/`, like the login.
- The limit that stays: the API's authorizer checks an access token's signature and expiry,
  not whether it was revoked. A copied access token works for at most its 15 minutes after a
  sign-out, plus the 5 minutes the authorizer remembers an answer. AWS's guide says so in its
  own words for any server that only verifies the token. The same is accepted for a deleted
  user (`docs/ARCHITECTURE.md` section 7.3). What the revocation ends is the making of new
  access tokens, for the seven days it would otherwise go on.
- **cognito-local implements `RevokeToken`**, and then refuses a refresh with the revoked
  token: the sign-out has an integration journey
  (`frontend/tests/integration/logout.service.test.ts`), and the local page and the deployed
  one do not differ in it.

**Seen in a browser** (2026-11-21, headless Chromium, the dev server against the local stack):

| Case | What the page did |
|---|---|
| The local Cognito running | The login in the same run of the script as the press, both fields empty; nothing of the person or of a token in the page, in a field or in the address; one `RevokeToken` to `/cognito/`, answered 200, its body the client id and the token, no `Authorization` header |
| The local Cognito stopped (its container stopped, then started again) | The same for the person; the request was answered 502 by the dev server; no message on the page. The browser itself writes one line about the 502 in its console: its own report of a failed request, not the page's |
| Cognito silent (the request held and never answered) | The same for the person; another person signed in meanwhile and got a frame of their own; the request was aborted after 10 seconds and nothing of the page changed |
| The console otherwise | `zod`'s one report (section 12.2); no token in any line |

**At the deployed page** (step 72, 2026-11-21): **a browser may make the call from the
page's address.** AWS's pages do not speak of it; in the browser's network panel the request
to Cognito sent at "Sign out" (`X-Amz-Target` ending in `RevokeToken`) was answered 200, not
blocked. It has to be looked at there on purpose, after any change to the policy of section
13.4 or to the call: a refused call would sign the person out all the same, and nothing on
the page would show it.

**Not yet looked at, at the deployed page:** that the real Cognito then refuses a refresh
with the revoked token (the local emulator does; `docs/FRONTEND_SERVICES.md` section 20.9),
and "Sign out" with the network off. Both are open items of `docs/RUNBOOK.md` section 5.5.

### 13.8 Left out on purpose

| Not there | Why | When it would come |
|---|---|---|
| A domain of our own | A certificate for CloudFront must be made in `us-east-1`, which the organization's policy blocks for this account; and nothing asks for it yet | Open point O10 |
| The session across a reload (O3) | Blocks nothing; `sessionStorage` would put tokens where a script injected into the page could read them, which the policy of section 13.4 is there to prevent but is a decision of its own | When asked |
| The distribution's own logs | They need a bucket and a setting per distribution; the API's access log and the functions' logs already say what the application did | When a question arises that those logs cannot answer |
| A firewall (AWS WAF) in front of the distribution | A monthly price, against the 1 USD budget; the API throttles and every route asks for a token | When the page has an audience beyond the people given a user |
| A second environment (a test copy of the page) | The local stack is the test environment (`docs/ARCHITECTURE.md` N5) | With a second back-end stack, never alone |
| A pipeline that deploys on a push | The back end has none either (`docs/IMPLEMENTATION_PLAN.md` section 6) | Together with the back end's |

**Cost.** At this size the bucket and the distribution stay inside AWS's free allowances
(CloudFront's is 1 TB and 10 million requests a month); The budget of 1 USD
(`npm run budget -w backend`) has no filter by stack: it watches the whole account's bill, the
hosting's included, and no second budget is made.
