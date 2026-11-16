# Front end — The view layer: the discussion, as it went

A copy of the answers given in the console on 2026-11-16 while working on brief
`prompts/80-design-view-layer.md`, kept so that they survive the session. In the order they were
given, each under the question that prompted it. **Not a source of truth**: the analysis is
`docs/FRONTEND_VIEW_OPTIONS.md` (v2), and the findings of the prototypes are in
`prototypes/README.md`.

---

## 1. The brief: analyse the options for the view layer and recommend one

### The clarification round

| Question | Answer |
|---|---|
| What the document covers | The view technology only. Hosting, CORS and session persistence stay for `docs/FRONTEND_ARCHITECTURE.md` |
| Who writes the views, what they know | No preference: judge on merit |
| How ambitious the interface is | Clean and functional, phone + desktop |
| Dependencies and tooling | Minimal, each one justified |

### The answer (v1 of the document)

The analysis is saved in `docs/FRONTEND_VIEW_OPTIONS.md`, as a proposal waiting for your review.
No other file was changed and nothing was installed.

**Recommendation: `lit-html`, used alone.** A view is a pure function from a state to an HTML
template, plus a small function that subscribes to the services' streams and renders at every
notification. There is no component framework, no custom elements, no compiler and no new file
format.

The reasoning rests on one observation: the services layer already is the application's state
management. What is left for the view technology is rendering, safe escaping of user text, events
and subscription lifetime.

| Option | Verdict |
|---|---|
| Plain TypeScript on the DOM | Fine for a form, but fails on lists (the week calendar) and leaves escaping to discipline. Escaping matters here because the tokens live in memory. |
| **`lit-html` alone** | The whole bridge is `state$.subscribe((s) => render(template(s), root))`. It is about 3 kB, adds no tooling and has no state model to misuse. |
| Lit custom elements | Same templates with more concepts; it stays available later for single pieces. |
| React / Preact | Needs an adapter hook between streams and its own state, and its everyday tools are exactly the logic you want kept out of views. |
| Angular | Best RxJS fit of the frameworks, but it brings a second toolchain and the most concepts for about eight screens. Its compiler also pins the whole monorepo to one TypeScript minor. |
| Svelte | Second choice: shortest views and reads observables natively, but its file format needs plug-ins for the type check, lint, tests and your comment rule. |

Vue, Solid, RxJS-first frameworks and htmx are set aside with a line each.

The one real weakness of `lit-html` is that the markup inside a template is not checked by the
compiler; only the expressions are. The document answers it with a DOM test per view and says
when to move to Svelte instead.

Things to look at when you review:

- **Logic between services and views (section 9, H1).** Some logic is neither a remote call nor
  allowed in a view: which week is shown, reloading after a booking, failure reasons in plain
  words. I propose plain TypeScript with no DOM between the two layers, but left the decision to
  `docs/FRONTEND_ARCHITECTURE.md`. It is the most important open point.
- **Sizes are not measured.** They are orders of magnitude from what I know of the libraries.
  Versions and the Angular TypeScript range were checked on npm today.
- **Pointers not added.** `CLAUDE.md` and `docs/FOLDER_STRUCTURE.md` do not mention the new
  document yet.

---

## 2. "What about pure CSS/HTML with JavaScript functions imported via a script element? Don't you think this can work?"

Yes, it can work, and my document was harder on it than it deserves. It is option A there (plain
TypeScript on the DOM), and I judged it without considering the HTML `<template>` element, which
answers most of my two objections.

It works under four conditions:

1. **One bundled module script, not plain script files.** The services are TypeScript and import
   `rxjs` and the shared package by name, which a browser cannot load directly. One esbuild
   command (already in the repository) produces a single `app.js`, loaded with
   `<script type="module" src="app.js">`. Classic scripts with global functions and `onclick="…"`
   attributes would force the services onto `window`, which `docs/FRONTEND_SERVICES.md` section
   9.7 forbids for the store, and would rule out a strict Content-Security-Policy.

2. **One HTML page, not several.** The session lives in memory, so every page load means signing
   in again. All screens sit in `index.html` as sections, and the script shows and hides them,
   which is exactly the "actions on pure view elements" of your brief.

3. **Lists are built from `<template>` elements.** The row markup stays in the HTML; the script
   clones it per item and fills it with `textContent`. That is safe against injected text, and a
   lint rule forbidding `innerHTML` can enforce it, so escaping no longer rests on discipline
   alone.

4. **Regions that are redrawn hold no input fields.** Without a library, the simple way to update
   a list is to rebuild it at every notification, which wipes focus and typed text inside it. If
   editing always happens in a dialog or a fixed form, never inline in a list, this problem does
   not arise.

What you still pay compared with `lit-html`:

- **More wiring code per view.** Each view needs its `querySelector` calls and one assignment per
  field.
- **Markup and code linked by selectors.** A typo in a selector is a runtime `null`, not a compile
  error. This is the same kind of weakness I held against `lit-html` templates.
- **The week calendar is the hard screen.** Seven days of windows, slots, appointments and busy
  blocks, cloned and positioned by hand, is feasible but is where the code will be longest.

Given that maximum simplicity is your key goal, I would change the recommendation: start with
plain HTML/CSS and one module script, with zero runtime dependencies beyond `rxjs` and the shared
package. Keep `lit-html` as the named fallback, to be added for a single view only if the week
calendar proves painful. The two mix without conflict, because `lit-html` renders into any
container.

---

## 3. "Explain me better what Svelte would give and would cost"

Svelte is a compiler: you write each view as a `.svelte` file holding its markup, its script and
its CSS, and at build time it becomes plain JavaScript that updates the DOM directly. For this
application it gives the nicest views of all the options and costs a toolchain.

### What it would give

A "my appointments" view, complete:

```svelte
<script lang="ts">
  let { appointments }: { appointments: AppointmentsService } = $props();
  const list = appointments.appointmentsState$;   // the Observable, as it is
  appointments.list({ upcoming: 'true' });
</script>

{#if $list.status === 'pending'}
  <p>Loading…</p>
{:else if $list.status === 'failure'}
  <p role="alert">{$list.message}</p>
{:else if $list.status === 'success'}
  <ul>
    {#each $list.appointments as a (a.appointmentId)}
      <li>{a.start} <button onclick={() => appointments.cancel(a.appointmentId)}>Cancel</button></li>
    {/each}
  </ul>
{/if}
```

(The console version wrote `upcoming: true`; the contract wants the string `'true'`.)

- **Observables read directly in the markup.** `$list` subscribes when the view appears and
  unsubscribes when it goes. There is no adapter and no subscription to manage by hand.
- **Loops and conditions in the markup.** `{#each}` and `{#if}` replace the cloning of
  `<template>` elements and the show/hide code of the plain approach.
- **Only what changed is updated.** A list can hold input fields and be redrawn without losing
  focus or typed text. This removes the fourth condition of the plain approach, and it makes the
  week calendar an ordinary screen instead of the hard one.
- **Escaping by default.** Raw HTML needs an explicit `{@html}`, which lint can forbid.
- **Checked templates.** Its checker knows that `$list.message` exists only inside the `failure`
  branch, and catches a misspelled field. Neither the plain approach nor `lit-html` does this for
  markup.
- **Components.** An appointment row or a dialog is written once and reused, with typed
  properties.
- **Scoped CSS and accessibility warnings.** Styles written in a component apply only to it, and
  the compiler warns about a field without a label or an image without text.
- **Small at run time.** About 10 kB and up, depending on the features used.

### What it would cost

- **A build chain becomes mandatory.** In practice that means Vite plus the Svelte plug-in;
  esbuild alone needs a community plug-in. The plain approach needs one esbuild command.
- **About six packages instead of zero or one.** These are `svelte`, `vite`, the Vite plug-in,
  `svelte-check`, `eslint-plugin-svelte` with its parser, and a DOM emulation for tests.
- **Every tool of the repository must be taught the new file format:**
  - `tsc` does not read `.svelte` files, so `typecheck` becomes `tsc` plus `svelte-check`.
  - ESLint needs a Svelte block, and the import allowlist on `frontend/src` must be extended to
    those files.
  - Your comment rule `local/doc-references` would have to work through the Svelte parser. I
    have not checked how far it does; comments in the markup part are the doubtful case.
  - The 100 % line coverage threshold is measured on compiled code mapped back to the source,
    which is fiddly for templates.
- **A second place for state.** Svelte has its own reactivity (`$state`, `$derived`, `$effect`).
  Your rule that views hold no logic would be kept by review, not by the tool.
- **Observables are the older of its two ways.** Svelte 5 centred itself on those "runes";
  reading stores with `$` is supported but is no longer where the framework is heading. There is
  also a trap: `$state` is a rune, so a variable named `state` cannot be read as `$state`.
- **A `result$` stream with no value yet reads as `undefined`.** The `state$` streams are fine
  because they always have a value; every template using a `result$` must allow for the gap.
- **More to learn, and misleading documentation.** Beyond the block syntax, properties and runes,
  most tutorials assume SvelteKit, its application framework with server rendering. You would not
  use it, so examples need translating.
- **Version churn.** It has changed its model twice (versions 3 and 5), so a future migration is
  likely.

### How I weigh it

Svelte buys you the week calendar and inline editing in lists, with checked templates. You pay
with a compiler and a file format that the whole repository has to accommodate.

With maximum simplicity as the key goal, I would still start with plain HTML/CSS and one module
script. Svelte becomes the better choice if you want inline editing in lists, or if the interface
grows well beyond the eight screens. If the week calendar alone proves painful in plain code,
`lit-html` for that one view is the cheaper fix.

---

## 4. "Show me how the appointments page code would look like with HTML/CSS and lit-html"

The same "My appointments" page written both ways, as sketches against the real
`AppointmentsService` types; not saved as code in the repository and not compiled. It lists the
upcoming appointments and lets the user cancel one.

Both versions assume a helper `formatWhen(appointment)` that formats the times in the calendar's
time zone. That is logic, so it lives outside the view. The CSS is the same for both.

```css
.appointments { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
.appointments li { display: grid; grid-template-columns: 1fr auto; gap: 0.25rem 1rem; padding: 0.75rem; border: 1px solid #ccc; border-radius: 6px; }
.appointments .note { grid-column: 1; color: #555; }
.appointments button { grid-row: 1 / span 3; grid-column: 2; align-self: center; }
.error { color: #b00020; }
@media (min-width: 40rem) { .appointments li { grid-template-columns: 14rem 10rem 1fr auto; } .appointments .note, .appointments button { grid-row: auto; grid-column: auto; } }
```

### Plain HTML + TypeScript

The markup is in `index.html`, including the row as a `<template>`:

```html
<section id="appointments" hidden>
  <h2>My appointments</h2>
  <p class="loading" hidden>Loading…</p>
  <p class="error list-error" role="alert" hidden></p>
  <p class="error cancel-error" role="alert" hidden></p>
  <p class="empty" hidden>No upcoming appointments.</p>
  <ul class="appointments"></ul>

  <template id="appointment-row">
    <li>
      <span class="when"></span>
      <span class="type"></span>
      <span class="note"></span>
      <button type="button">Cancel</button>
    </li>
  </template>
</section>
```

```ts
// appointments.view.ts
const UPCOMING = { upcoming: 'true' } as const;

export function mountAppointments(root: HTMLElement, appointments: AppointmentsService): Subscription {
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loading = find('.loading');
  const listError = find('.list-error');
  const cancelError = find('.cancel-error');
  const empty = find('.empty');
  const list = find<HTMLUListElement>('.appointments');
  const rowTemplate = find<HTMLTemplateElement>('#appointment-row');

  // One row: a copy of the <template>, filled with textContent only (never innerHTML).
  const rowFor = (a: Appointment): HTMLLIElement => {
    const row = (rowTemplate.content.cloneNode(true) as DocumentFragment).querySelector('li')!;
    row.dataset.id = a.appointmentId;
    row.querySelector('.when')!.textContent = formatWhen(a);
    row.querySelector('.type')!.textContent = a.typeName;
    row.querySelector('.note')!.textContent = a.note ?? '';
    row.querySelector('button')!.onclick = () => appointments.cancel(a.appointmentId);
    return row;
  };

  // The list: rebuilt at every notification.
  const subscription = appointments.appointmentsState$.subscribe((state) => {
    loading.hidden = state.status !== 'pending';
    listError.hidden = state.status !== 'failure';
    listError.textContent = state.status === 'failure' ? state.message : '';
    const items = state.status === 'success' ? state.appointments : [];
    empty.hidden = !(state.status === 'success' && items.length === 0);
    list.replaceChildren(...items.map(rowFor));
  });

  // The cancel: find the row's button by its id, show a refusal, reload after a success.
  subscription.add(
    appointments.cancelState$.subscribe((state) => {
      for (const row of list.querySelectorAll('li')) {
        row.querySelector('button')!.disabled = state.status === 'pending' && row.dataset.id === state.appointmentId;
      }
      cancelError.hidden = state.status !== 'failure';
      cancelError.textContent = state.status === 'failure' ? state.message : '';
      if (state.status === 'success') appointments.list(UPCOMING); // logic: belongs outside the view
    }),
  );

  appointments.list(UPCOMING); // subscribe first, then call
  return subscription;
}
```

### lit-html

`index.html` holds only the empty container; the markup is in the template function:

```html
<section id="appointments" hidden></section>
```

```ts
// appointments.view.ts
import { html, nothing, render } from 'lit-html';

const UPCOMING = { upcoming: 'true' } as const;

type State = { list: AppointmentsState; cancel: CancelState };
type Handlers = { onCancel: (appointmentId: string) => void };

// The view: pure functions from state to markup. Values are inserted as text.
const row = (a: Appointment, cancel: CancelState, on: Handlers) => html`
  <li>
    <span class="when">${formatWhen(a)}</span>
    <span class="type">${a.typeName}</span>
    <span class="note">${a.note ?? ''}</span>
    <button
      type="button"
      ?disabled=${cancel.status === 'pending' && cancel.appointmentId === a.appointmentId}
      @click=${() => on.onCancel(a.appointmentId)}
    >Cancel</button>
  </li>`;

const body = ({ list, cancel }: State, on: Handlers) => {
  if (list.status === 'pending') return html`<p class="loading">Loading…</p>`;
  if (list.status === 'failure') return html`<p class="error" role="alert">${list.message}</p>`;
  if (list.status !== 'success') return nothing;
  if (list.appointments.length === 0) return html`<p class="empty">No upcoming appointments.</p>`;
  return html`<ul class="appointments">${list.appointments.map((a) => row(a, cancel, on))}</ul>`;
};

export const appointmentsTemplate = (state: State, on: Handlers) => html`
  <h2>My appointments</h2>
  ${state.cancel.status === 'failure' ? html`<p class="error" role="alert">${state.cancel.message}</p>` : nothing}
  ${body(state, on)}`;

// The wiring: subscribe, render at every notification, user action → service call.
export function mountAppointments(root: HTMLElement, appointments: AppointmentsService): Subscription {
  const on: Handlers = { onCancel: (appointmentId) => appointments.cancel(appointmentId) };

  const subscription = combineLatest({ list: appointments.appointmentsState$, cancel: appointments.cancelState$ })
    .subscribe((state) => render(appointmentsTemplate(state, on), root));

  subscription.add(
    appointments.cancelState$
      .pipe(filter((state) => state.status === 'success'))
      .subscribe(() => appointments.list(UPCOMING)), // logic: belongs outside the view
  );

  appointments.list(UPCOMING); // subscribe first, then call
  return subscription;
}
```

### What the comparison shows

- **Size is about the same.** For a page like this, neither is clearly shorter.
- **Where the markup lives.** In the plain version the whole page can be read and styled in the
  HTML file without opening TypeScript. In the `lit-html` version markup and data sit together in
  one function, and the HTML file says nothing about the page.
- **The link between markup and code.** The plain version depends on eight selectors (`.when`,
  `.cancel-error`, …); a typo is a `null` at run time. The `lit-html` version has no selectors,
  but a typo inside the template markup is not caught either.
- **Reacting to a second stream.** To disable one Cancel button, the plain version has to find
  the row by its `data-id` and touch the button. With `lit-html` it is one more expression in the
  row template. This gap grows with every stream a page listens to.
- **Redrawing.** The plain version rebuilds the whole list at every notification, which is fine
  here because rows hold no input. If you later want to edit the note inline in the row, the
  plain version breaks (typed text is lost on a rebuild) and the `lit-html` version does not.

---

## 5. "Update the document with the plain HTML/CSS recommendation"

`docs/FRONTEND_VIEW_OPTIONS.md` is now v2 and recommends plain HTML/CSS with one TypeScript module
script, with `lit-html` as the fallback for single views. It is still a proposal waiting for your
review; no other file was changed.

What changed from v1:

- **Recommendation (section 6):** plain HTML/CSS first, under the four conditions we discussed:
  one bundled module script, one HTML page, user text only through `textContent` and
  `<template>`, and no input field inside a redrawn list. It also names when to add `lit-html`
  for a view and when to reconsider Svelte.
- **Option A (section 4.1):** rewritten with the `<template>` technique and an honest list of
  what it still costs.
- **Comparison table (section 5):** option A re-rated; it and `lit-html` now come out close, with
  plain ahead on adding nothing.
- **Concrete sketch (section 7):** the "My appointments" page in plain HTML and TypeScript.
- **Set-aside options (section 4.7):** two rows added, for classic non-module scripts and for
  several HTML pages, since both are natural readings of "plain HTML" that would not work here.
- **Svelte (section 4.6):** expanded with the gives and costs from our discussion.
- **Change log:** added, recording why v1's judgement of the plain option was too harsh.

Two things differ from what I showed you in the chat:

- **Reload after cancel:** I took it out of the appointments view. It is a rule of the
  application rather than of the screen, so it is listed with the open point on where such logic
  lives (section 9, H1). That point remains the most important one for
  `docs/FRONTEND_ARCHITECTURE.md`.
- **Condition 4 as a design constraint:** "no inline editing in lists" is recorded as decision 6,
  because it limits how the screens can be designed. Say so if you would rather not accept that.

---

## 6. "Create the login and the calendar view using pure HTML/CSS and with lit-html, in different folders"

Both versions are built in `prototypes/` and work against the local stack. I drove each in a
headless browser as `alice` and as `admin` (sign-in, week, booking, detail, cancellation, phone
width, sign-out) and all four runs passed; there are no automated tests in the folder.

### Where to look

| Folder | Content | Lines |
|---|---|---|
| `prototypes/view-plain/` | Plain HTML/CSS: all markup in `index.html`, two view scripts | 332 (107 HTML + 225 TypeScript) |
| `prototypes/view-lit/` | `lit-html`: empty containers in `index.html`, markup in the view scripts | 253 (15 HTML + 238 TypeScript) |
| `prototypes/common/` | Shared by both, so only the views differ: the logic between services and views, the shell, one style sheet | 376 |

Read side by side:

- `view-plain/login.view.ts` against `view-lit/login.view.ts`
- `view-plain/index.html` plus `view-plain/calendar.view.ts` against `view-lit/calendar.view.ts`

Both use the real services from `frontend/src/services` unchanged. The calendar shows the week for
either role, and a free slot opens a book dialog (the Administrator also picks the user). An
appointment opens its detail with a cancel button. I left out changing an appointment, editing a
note and the Administrator's custom start and end.

### Running them

The local stack must be up. Then:

```sh
node prototypes/serve.mjs plain   # http://localhost:5173
node prototypes/serve.mjs lit     # http://localhost:5174
```

Sign in as `alice` / `Alice-Local-Pass-1!` or `admin` / `Admin-Local-Pass-1!`. The server proxies
the API and Cognito so the browser sees one origin, which works around the missing CORS
configuration. `prototypes/seed.mjs` adds sample availability, but the local calendar already had
data, so it did nothing.

### What writing both showed

- **Size is close.** The TypeScript is 225 lines against 238. `lit-html` adds 3.5 kB to the
  bundle (measured).
- **Plain repeats every element three times:** in the HTML, in the line that finds it, and in the
  line that fills it. The calendar script opens with 22 look-ups, and a renamed class fails only
  at run time.
- **Dialogs suit plain better.** A modal dialog is opened by a method call, which a template
  cannot express. The `lit-html` view needs a view-state subject, a sync step after each render
  and a flag to hide an earlier failure; in plain it is `dialog.showModal()` and one line.
- **The week grid suits `lit-html` better.** One template for a day with the data in place,
  against five small copy-and-fill functions in plain.
- **Plain must clean up by hand on sign-out.** The sections stay in the page, so forgetting to
  empty them would show one person's week to the next.
- **`lit-html` has a trap under a strict Content-Security-Policy.** Its `styleMap` directive and
  `style=` attributes are refused, and the blocks lost their positions until I bound the `style`
  property instead. The plain version never had the problem.
- **The shared logic matters more than the choice.** Because `common/logic.ts` hands over a week
  that is ready to draw, both views stay thin.

All of this is in `prototypes/README.md`.

### Side effects

- **Local data:** my test runs booked and cancelled four appointments in the local calendar
  table; they remain there as cancelled history, as after the smoke test.
- **Not a workspace:** `lit-html` is installed in `prototypes/node_modules`, so the root
  `package.json` and lock file are untouched. Deleting the folder removes everything.
- **Deploy guard:** the untracked folder makes the tree dirty, which blocks
  `npm run deploy -w backend` until it is deleted or committed.
- **`zod` console message:** under the strict policy it logs one harmless violation at start-up,
  because it probes for `eval`. It affects both versions and is a point for the hosting decision.
