# Front end — The view layer: options and recommendation

| | |
|---|---|
| Status | v3 — **recommendation accepted** (2026-11-16, brief `prompts/81-frontend-architecture-view-layer.md`): the views are plain HTML/CSS with one TypeScript module script. The rules are in `docs/FRONTEND_ARCHITECTURE.md`, which is the source of truth; this document stays as the record of the options and of why, and is not updated further (v4, 2026-11-20, is a note on its status line and change log only: the view layer is implemented, and the trial's code is no longer in the repository). v2 — proposal (2026-11-16, brief `prompts/80-design-view-layer.md`) |
| Scope | How the views are written: the technology that turns the services' streams into a screen and the user's actions into service calls. An analysis of the options and one recommendation |
| Not in scope | Hosting, the CORS gap (`docs/FRONTEND_SERVICES.md` section 10.3), keeping the session across a reload (section 9.6 there), the build and dev tooling, the screens' design. They belong to `docs/FRONTEND_ARCHITECTURE.md`; section 9 lists what this recommendation hands over to it |
| Depends on | `docs/FRONTEND_SERVICES.md` v7 (the rules of section 2, the pattern of section 3, the "Use from the view layer" sections), `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need), `docs/FOLDER_STRUCTURE.md` section 7 |

### Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-11-16 | First analysis. Recommended `lit-html` used alone; plain DOM code judged unsafe (escaping) and complicated (lists). |
| v2 | 2026-11-16 | **Recommendation changed to plain HTML/CSS with one TypeScript module script**, after the review of v1. v1 had judged the plain option without the HTML `<template>` element and without a lint rule on `innerHTML`, which answer most of its two objections. `lit-html` becomes the named fallback, for single views. Sections 4.1, 5, 6, 7, 8, 9 and 10 rewritten accordingly; the other options are unchanged. |
| v4 | 2026-11-20 | A note only (`docs/FRONTEND_VIEW_PLAN.md` step 69): every view of `docs/SHARED_CALENDAR_SPEC.md` section 16.8 is written the way recommended here, and `lit-html`, the fallback, was not needed (`docs/FRONTEND_ARCHITECTURE.md` sections 7.1 and 7.2). The two prototypes of the trial, a folder `prototypes/` at the root of the repository, were throw-away and were deleted at that step; they are in git history, and commit `f2ade74` is the last that holds them. The text below is still v2's, unchanged. |
| v3 | 2026-11-16 | Recommendation accepted after the two prototypes (login and week calendar, plain and `lit-html`). Status line only: the text below is v2's, unchanged. Its section 9 points H1, H2 and H4 are decided in `docs/FRONTEND_ARCHITECTURE.md` (section 5 for H1, section 9 for H2 and H4); H3 and H5 to H8 are open points there (section 10). |

**The recommendation in one paragraph.** Write the views in **plain HTML and CSS, with one
TypeScript module script**: the markup of every screen is in `index.html`, the script subscribes
to the services' streams, fills the markup and turns the user's actions into service calls. No
rendering library, no framework, no compiler beyond the one bundle command the browser needs
anyway. It holds under four conditions (section 6), which are simple and can mostly be enforced by
lint. **`lit-html` is the fallback**, to be added for a single view on the day the plain code of
that view proves painful; the week calendar is the candidate. Svelte is the alternative if the
interface grows well beyond today's views. React and Angular solve problems this application
does not have, at a price it would pay every day.

---

## 1. What was asked, and the answers of the clarification round

The brief asks for the options to implement the view layer and a recommendation, with maximum
simplicity as a key goal. Four points were settled before writing:

| Question | Answer |
|---|---|
| What the document covers | The view technology only. Hosting, CORS and session persistence stay for `docs/FRONTEND_ARCHITECTURE.md` |
| Who writes the views, what they know | No preference: judge on merit. The views are written mostly with Claude, under review |
| How ambitious the interface is | Clean and functional, on a phone and on a desktop. Hand-written CSS, no design system |
| Dependencies and tooling | Minimal, each one justified. A bundler is accepted; at most one small rendering library if it clearly pays for itself |

On reviewing v1 the question was put: would plain HTML/CSS with imported script functions not
work? It does, and with maximum simplicity as the key goal it is the better starting point. That
is v2.

## 2. What a view is allowed to do

From the brief, a view's logic is limited to three things:

1. **subscribe** to the observable streams it needs;
2. **react** to their notifications by adjusting the screen;
3. **turn the user's actions** into either a call to a service method, or an action on pure view
   elements (show, hide, open a dialog).

Nothing else stays in a view: no remote call, no business rule, no date arithmetic, no state
that the rest of the application needs.

This rule decides most of the analysis, so it is worth saying why. **The services layer already
is the application's state management.** Every remote call has its stream; `state$` streams carry
`idle` → `pending` → outcome; the `SessionStore` says who is signed in; failures are values, never
errors. What a UI framework usually brings on top of rendering (a state model, effects, stores,
dependency injection, data fetching) is here either already done or forbidden in the view. What
is left for the view technology is small:

| # | The job | Example in this application |
|---|---|---|
| J1 | Turn a state value into DOM, again at every notification | The week calendar after `calendarState$` emits; a form must not lose the text being typed or the focus |
| J2 | Put user-entered text on the screen safely | Usernames and appointment notes: text typed by one person, shown to another |
| J3 | Listen to the user and call a service | `form.onsubmit` → `login.login(…)` |
| J4 | Subscribe when the view appears, unsubscribe when it goes | Leaving the week view for the settings view |
| J5 | Keep pure view state | Which dialog is open, which week is shown |

J2 matters more than usual here: the tokens live in memory, in the `SessionStore`
(`docs/FRONTEND_SERVICES.md` section 2, rule 9), so a script injected through a badly escaped
note could act as the signed-in person, the Administrator included.

The views to build are those of `docs/SHARED_CALENDAR_SPEC.md` section 16.8, plus login and user
administration: about eight screens, two roles, a handful of dialogs. The largest piece of
rendering is the week calendar: seven days of windows, slots, appointments and busy blocks.

## 3. Criteria

| # | Criterion | The question |
|---|---|---|
| C1 | Fit with the services | How much glue between an `Observable` and the screen? Does "subscribe first, then call" come naturally? |
| C2 | Thin views | Does the technology bring a second place for state and logic, which then has to be kept empty by discipline? |
| C3 | Concepts | How many things must a new developer learn before changing a view? |
| C4 | Weight at run time | Dependencies shipped to the browser |
| C5 | Tooling added to the repository | Compiler, file format, plug-ins for `tsc`, ESLint, vitest. Today: `tsc`, ESLint with the comment rule `local/doc-references`, vitest, esbuild |
| C6 | Safety | Is user text escaped (J2), and by the tool or by discipline? |
| C7 | Checked views | Does the compiler catch a mistake in a view's markup or in its link to the code? |
| C8 | Enough for the views | Lists, the week grid, forms, dialogs, phone and desktop (J1, J5) |
| C9 | Staying power | Will it still be there, and still work the same way, in five years? |

## 4. The options

The same small view, the login form, is sketched in each of the five main options. It needs
`loginState$` (to disable the button while the call is pending and to show a failure) and one
call, `login.login(username, password)`.

Versions are those on npm on 2026-11-16. Sizes are orders of magnitude (minified and compressed,
from the libraries' own figures), not measured in this repository.

### 4.1 Option A — Plain HTML/CSS and a TypeScript module script (recommended)

The style of the sketches in `docs/FRONTEND_SERVICES.md` (sections 4.6 and 18.6). The markup is
written in `index.html`; the script finds the elements and works on them.

```html
<section id="login">
  <form>
    <input name="username" autocomplete="username" required />
    <input name="password" type="password" autocomplete="current-password" required />
    <button>Sign in</button>
    <p role="alert"></p>
  </form>
</section>
```

```ts
export function mountLogin(root: HTMLElement, login: LoginService): Subscription {
  const form = root.querySelector('form')!;
  const button = root.querySelector('button')!;
  const alert = root.querySelector('p')!;
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    login.login(String(data.get('username')), String(data.get('password')));
  };
  return login.loginState$.subscribe((state) => {
    button.disabled = state.status === 'pending';
    alert.textContent = state.status === 'failure' ? state.message : '';
  });
}
```

**For.**

- **C4, C5, C9: nothing is added.** No run-time dependency beyond `rxjs` and the shared package,
  no library to learn or to upgrade, nothing that can be deprecated: HTML, CSS and the DOM are
  the most stable API there is.
- **C2, nowhere to hide logic.** There is no component model and no state system. A mount
  function subscribes, assigns and forwards events: the three things of section 2.
- **C3.** Only the web platform. A page can be read, and styled, in the HTML file without
  opening the TypeScript.
- **C1.** `state$.subscribe((state) => { … })` with assignments inside. The subscription is made
  when the view is mounted, before the user can do anything, so "subscribe first, then call"
  (`docs/FRONTEND_SERVICES.md` section 2, rule 5) holds by construction.
- **J2 is answered by the platform**: `textContent` never interprets markup, and a row is a
  copy of an HTML `<template>` element filled with `textContent`. A lint rule that forbids
  `innerHTML` and its relatives in the views turns the discipline into a check.

**Against.**

- **C8, lists are rebuilt.** HTML has no loop: a list is drawn by cloning a `<template>` per
  item and replacing the list's children at every notification. Whatever is inside loses its
  focus, its scroll position and its typed text. Harmless for a read-only list, wrong for a list
  with an input in each row. Hence condition 4 of section 6: editing happens in a dialog or a
  fixed form, never inline in a redrawn region.
- **C7, markup and code are linked by selectors.** `root.querySelector('.note')!` with a typo is
  a `null` at run time, not a compile error. Each view's DOM test (section 8) catches it.
- **More wiring per view**: a line to find each element, a line to fill it. And reacting to a
  second stream means finding the nodes again: to disable one row's "Cancel" button while its
  call is pending, the code looks the row up by a `data-id`. This grows with the number of
  streams a view listens to.
- **The week calendar is the hard screen.** Seven days of windows, slots, appointments and busy
  blocks, cloned and positioned by hand: feasible, but where the code will be longest. It is the
  first candidate for the fallback of section 6.
- **A temptation to resist**: writing a small helper for nodes, then one for lists, and ending up
  with a home-made rendering library. The day that helper is wanted is the day to add `lit-html`
  for that view instead.

### 4.2 Option B — `lit-html`, used alone (the fallback)

`lit-html` (3.3.3, by Google, the rendering half of Lit) is one function and one template tag.
`html` marks a template written as a standard JavaScript template literal; `render(template,
container)` puts it on the page the first time and, every time after, **changes only the values
that differ**. Nothing else comes with it: no components, no state, no lifecycle.

```ts
import { html, render } from 'lit-html';

// The view: a pure function. Same state in, same template out.
const loginTemplate = (state: LoginState, onSubmit: (event: SubmitEvent) => void) => html`
  <form @submit=${onSubmit}>
    <input name="username" autocomplete="username" required />
    <input name="password" type="password" autocomplete="current-password" required />
    <button ?disabled=${state.status === 'pending'}>Sign in</button>
    <p role="alert">${state.status === 'failure' ? state.message : ''}</p>
  </form>`;

// The wiring: subscribe, render at every notification, user action → service call.
export function mountLogin(root: HTMLElement, login: LoginService): Subscription {
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    const data = new FormData(event.target as HTMLFormElement);
    login.login(String(data.get('username')), String(data.get('password')));
  };
  return login.loginState$.subscribe((state) => render(loginTemplate(state, onSubmit), root));
}
```

**For.**

- **C1, the fit is exact.** The whole bridge between RxJS and the screen is
  `state$.subscribe((s) => render(template(s), root))`. A view with several streams combines
  them (`combineLatest`) and still has one `render`: no node is ever looked up.
- **C2.** The library has no state model and no effects, like option A.
- **J1 solved.** The same template function draws a list the first time and every time after;
  the library touches only what changed, so a field inside a list keeps its text and its focus.
- **J2 solved by default.** Every value placed in a template is inserted as text. Raw HTML needs
  an explicit import (`unsafeHTML`) that a lint rule can forbid.
- **C5, no new tooling.** Templates are ordinary TypeScript in ordinary `.ts` files.
- **C4.** About 3 kB, with no run-time dependency of its own.
- **It mixes with option A.** `render` works on any container, so one view can use it while the
  others stay plain.

**Against.**

- **A dependency**, small and stable (the API `html`/`render` has not changed since 2021), but
  one more thing than none.
- **C7, the markup is a string to the compiler.** The expressions inside `${…}` are fully
  type-checked; the HTML around them is not: `@clcik` is not a compile error. The same kind of
  weakness as option A's selectors, answered the same way, by a DOM test.
- **A small syntax to learn**: `@event`, `?boolean-attribute`, `.property`.
- **The markup leaves the HTML file**: `index.html` holds an empty container, and the page is
  read in TypeScript.

### 4.3 Option C — Lit components (custom elements)

The full Lit library (`lit` 3.3.3, about 6 kB): `lit-html` plus `LitElement`, a base class for
browser custom elements with reactive properties, a lifecycle (`connectedCallback`,
`disconnectedCallback`) and styles scoped by shadow DOM.

It adds a natural place for J4 (subscribe on connect, unsubscribe on disconnect) and reusable
tags (`<week-calendar>`). It also adds what this application has no use for: a class per view,
a property system that is a second state model next to the streams (C2), shadow DOM (the page's
CSS no longer reaches inside a component, so shared styles need a plan), and decorators or
their longer equivalent. More concepts than option B for the same screens.

It is the upgrade path from B, not a different road: the templates are the same.

### 4.4 Option D — React (or Preact)

React 19.3.1 with `react-dom`, about 60 kB; Preact 11 is the same model in about 5 kB.

```tsx
// The adapter every component needs. React renders before the effect subscribes, so it needs
// a value to start from, which the services deliberately do not offer synchronously.
function useObservable<T>(source$: Observable<T>, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const subscription = source$.subscribe((next) => setValue(() => next));
    return () => subscription.unsubscribe();
  }, [source$]);
  return value;
}

function Login({ login }: { login: LoginService }) {
  const state = useObservable<LoginState>(login.loginState$, { status: 'idle' });
  return (
    <form onSubmit={(event) => { event.preventDefault(); /* read the fields */ login.login(u, p); }}>
      …
      <button disabled={state.status === 'pending'}>Sign in</button>
      <p role="alert">{state.status === 'failure' ? state.message : ''}</p>
    </form>
  );
}
```

**For.** JSX is checked by `tsc` (C7, the best of all options together with Angular); escaping
by default (C6); the largest ecosystem and the most people who know it; `tsc` and esbuild read
JSX natively.

**Against.**

- **C1, an impedance mismatch.** React's model is "state lives in React, rendering is a pure
  function of it"; the services' model is "state arrives from outside, as a stream". The two
  meet through a hook that copies each notification into React state. It works, but it has
  edges: the first render happens before the subscription, with an invented initial value
  (`docs/FRONTEND_SERVICES.md` section 3.3 keeps `.value` out of the API on purpose); development
  mode mounts every effect twice, so every subscription is made, dropped and made again.
- **C2, the temptation is built in.** `useState`, `useEffect`, `useMemo`, context: the framework's
  everyday tools are exactly the "other logic" the brief keeps out of the views. The rule would
  be kept by review alone, against the grain of every React example and habit.
- **C3.** Hooks and their rules, dependency arrays, re-render semantics, keys, controlled against
  uncontrolled inputs. None of it is about this application.
- **C5.** `.tsx` files, the JSX compiler setting, a React ESLint plug-in (the hook rules are not
  optional in practice), a testing library, and in practice a router.

React pays for itself when the application's state lives in the components and when the team
already thinks in it. Neither is true here.

### 4.5 Option E — Angular

Angular 22.2.6. The only mainstream framework built around RxJS.

```ts
@Component({
  selector: 'app-login',
  imports: [AsyncPipe],
  template: `
    @if (login.loginState$ | async; as state) {
      <form (submit)="submit($event)">
        …
        <button [disabled]="state.status === 'pending'">Sign in</button>
        <p role="alert">{{ state.status === 'failure' ? state.message : '' }}</p>
      </form>
    }`,
})
export class LoginComponent {
  protected readonly login = inject(LoginService);
  protected submit(event: SubmitEvent) { /* read the fields */ this.login.login(u, p); }
}
// And once, at start-up, because the services are plain classes with injected configuration:
// { provide: LoginService, useFactory: () => new LoginService(config, inject(SessionStore)) }
```

**For.** **C1 is the best of all the frameworks**: the `async` pipe subscribes and unsubscribes
for the view (J4 for free), and dependency injection is the container that
`docs/FRONTEND_SERVICES.md` section 2, rule 1, foresees. Templates are checked by the compiler
(C7), escaped by default (C6). Router, forms and testing come in the box.

**Against.**

- **C5, a second toolchain.** Angular brings its own CLI, workspace file, compiler, builder and
  test set-up, next to the repository's `tsc` + ESLint + vitest + esbuild rather than inside
  them. Its compiler accepts one TypeScript minor only (today `>=6.0 <6.1`): the whole monorepo's
  TypeScript upgrades would follow Angular's calendar, the back end's included.
- **C3, the longest list of concepts**: components, templates and their control flow, dependency
  injection and providers, change detection, signals next to observables (the framework itself
  is moving from RxJS to signals, so the `async` pipe is no longer the centre of its future),
  decorators, a major version every six months.
- **C4.** The heaviest: from about 60 kB for an empty application upwards.
- **C2.** Components are classes with fields, lifecycle hooks and injected anything: plenty of
  room for logic.

Angular is the right answer for a large application with many developers and many screens,
where its conventions replace decisions. For eight screens whose state is already managed it is
the most machinery per screen of all the options, and "minimal, each one justified" excludes it.

### 4.6 Option F — Svelte

Svelte 5.57.3. A compiler: components are `.svelte` files holding markup, script and CSS, turned
at build time into small DOM code. Its "store" contract is, by design, compatible with RxJS: any
object with a `subscribe` method works, so an `Observable` can be read in the markup with a `$`
prefix, subscribed and unsubscribed by the component.

```svelte
<script lang="ts">
  let { login }: { login: LoginService } = $props();
  const loginState = login.loginState$; // an Observable is a Svelte store as it is
  function submit(event: SubmitEvent) { /* read the fields */ login.login(u, p); }
</script>

<form onsubmit={submit}>
  …
  <button disabled={$loginState.status === 'pending'}>Sign in</button>
  <p role="alert">{$loginState.status === 'failure' ? $loginState.message : ''}</p>
</form>
```

**For.**

- **The shortest views of all**, with no adapter (C1, J4 for free), and loops and conditions in
  the markup (`{#each}`, `{#if}`).
- **Only what changed is updated**: a list can hold input fields and be redrawn (J1), so the
  week calendar is an ordinary screen and condition 4 of section 6 would not be needed.
- **Checked markup** (C7), by its own tool, which knows for instance that `message` exists only
  on a failure. Escaping by default (C6).
- Components with typed properties, CSS scoped per component, accessibility warnings from the
  compiler. Small at run time (about 10 kB and up, by features used).

**Against.**

- **C5, the whole repository must be taught a file format.** In practice Vite and the Svelte
  plug-in for the build and for vitest; `svelte-check` next to `tsc` for the type check;
  `eslint-plugin-svelte` and its parser; the import rule on `frontend/src` and the comment rule
  `local/doc-references` extended to `.svelte` files (how far the latter reaches comments in the
  markup part is not checked); line coverage measured on compiled code. About six packages
  against none.
- **C2.** A full component model with its own reactivity (`$state`, `$derived`, `$effect`),
  a second place for state. Svelte 5 moved its centre from stores to these "runes": reading an
  observable with `$` is supported, but it is the older of two ways, and it has a trap (`$state`
  is a rune, so a variable named `state` cannot be read that way). A `result$` with no value yet
  reads as `undefined`, which every use must allow for.
- **C3.** Block syntax, properties, runes; and most of its documentation assumes SvelteKit, its
  application framework with server rendering, which would not be used here.
- **C9.** Two large changes of model in its life (version 3, version 5). Healthy, but less
  stable in its API than the others.

Svelte is the strongest framework for this application. It buys the week calendar, inline
editing in lists and checked markup; it is paid with a compiler and a file format.

### 4.7 Options looked at and set aside

| Option | Why not |
|---|---|
| **Classic scripts** (`<script src>` without `type="module"`, global functions, `onclick="…"` attributes) | The plain option, but without modules. The services import `rxjs` and the shared package, so they would have to be put on `window`, which `docs/FRONTEND_SERVICES.md` section 9.7 forbids for the store; and handlers written in attributes rule out a strict Content-Security-Policy. Condition 1 of section 6 instead |
| **Several HTML pages** | The session lives in memory (`docs/FRONTEND_SERVICES.md` section 9.6): every page load would mean signing in again. Condition 2 of section 6 instead |
| **Vue** 3.5 | A component model and single-file format like Svelte's, with the same tooling cost (C5), but no native reading of observables: it needs an extra package (`@vueuse/rxjs`). Nothing it does better than Svelte for this case |
| **Solid** 1.9 | Reads observables natively (`from`) and has checked JSX, but its JSX needs its own compiler plug-in (not `tsc`'s), and it has the smallest community of the list (C9) |
| **RxJS-first frameworks** (Cycle.js and similar) | The purest match on paper; in practice niche, with little maintenance. Not a base for an application that must last |
| **Server-rendered pages, htmx** | The architecture is a single-page application on static hosting (`docs/FOLDER_STRUCTURE.md` section 7), with the services running in the browser. A different architecture, not a view option |
| **A component library** (Material, Shoelace, …) | Not needed for "clean and functional"; native controls cover the needs of section 16.8 of `docs/SHARED_CALENDAR_SPEC.md`. Can be added later under any option |

## 5. Comparison

`++` very good, `+` good, `·` acceptable, `−` a cost, `−−` a heavy cost. The judgement is for
this application: thin views over a finished services layer, eight screens. Option A is judged
with the conditions of section 6.

| | **A plain HTML/CSS** | B lit-html | C Lit elements | D React | E Angular | F Svelte |
|---|---|---|---|---|---|---|
| C1 Fit with the services | **+** | ++ | + | − | ++ | ++ |
| C2 Thin views | **++** | ++ | · | − | − | · |
| C3 Concepts to learn | **++** | + | · | − | −− | · |
| C4 Weight at run time | **++ (0)** | ++ (≈ 3 kB) | ++ (≈ 6 kB) | · (≈ 60 kB; Preact ≈ 5) | − (≥ 60 kB) | + (≈ 10 kB +) |
| C5 Tooling added | **++** | ++ | + | · | −− | − |
| C6 Safety | **+** (by a lint rule) | ++ | ++ | ++ | ++ | ++ |
| C7 Checked views | **−** (selectors) | − (markup) | − | ++ | ++ | + |
| C8 Enough for the views | **·** (lists rebuilt; the week grid) | + | + | ++ | ++ | ++ |
| C9 Staying power | **++** | + | + | ++ | + | · |

Reading the table: A and B are close and lead on the four criteria that "maximum simplicity"
means (C2, C3, C4, C5). A is ahead on having nothing at all to add; B is ahead where a view
redraws lists or listens to several streams (C1, C8). D and E are strong exactly where this
application asks for little and costly where it asks for much. F is good everywhere except
tooling.

## 6. Recommendation

**Option A: plain HTML and CSS, with one TypeScript module script.** `lit-html` (option B) is the
fallback, view by view.

Why A before B: they are close, and A adds nothing. Starting with nothing and adding one small
library on the day a view asks for it is cheaper and safer than adding it first for the views
that may never need it; and the two mix in one page, so the step costs one view, not a rewrite.

**The four conditions.** The plain option holds if these are kept:

1. **One bundled module script.** The browser cannot load TypeScript, nor the imports of `rxjs`
   and of the shared package by name. One bundle command produces one file, loaded with
   `<script type="module" src="…">`. Events are attached in the script (`onsubmit = …`,
   `addEventListener`), never written in HTML attributes; nothing is put on `window`.
2. **One HTML page.** Every screen is a `<section>` of `index.html`; the script shows one and
   hides the others (`hidden`). This is the brief's "action on pure view elements", and it keeps
   the in-memory session alive.
3. **User text goes in through `textContent`; a row is a copy of a `<template>`.** `innerHTML`,
   `outerHTML` and `insertAdjacentHTML` are not used in the views, and a lint rule says so.
4. **A region that is redrawn holds no input field.** A list is rebuilt at every notification;
   editing happens in a dialog or a fixed form, outside the list.

**When to add `lit-html` for a view.** When one of these is true for that view: it needs input
fields inside a list that is redrawn (condition 4 cannot be kept); the code that looks nodes up
to react to a second or third stream has become longer than the rest; someone is about to write
a helper that builds or updates nodes. The week calendar is the likely first case, and it may be
the only one.

**When to think again altogether.** Svelte, if the interface grows well beyond the views of
`docs/SHARED_CALENDAR_SPEC.md` section 16.8, or if a design system with rich ready-made
components becomes a requirement. The services layer would not change.

## 7. What the recommended option looks like

A sketch, to make the recommendation concrete. The final rules belong to
`docs/FRONTEND_ARCHITECTURE.md`.

**A view is a section of `index.html` and one mount function**: `(root, services…) =>
Subscription`. It finds its elements once, subscribes to the streams, adjusts the elements at
every notification, and attaches the handlers that turn DOM events into service calls. It
returns the subscription; whoever mounted the view unsubscribes it (J4).

The "My appointments" view, with a list and one action per row:

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
const UPCOMING = { upcoming: 'true' } as const;

export function mountAppointments(root: HTMLElement, appointments: AppointmentsService): Subscription {
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const loading = find('.loading');
  const listError = find('.list-error');
  const cancelError = find('.cancel-error');
  const empty = find('.empty');
  const list = find<HTMLUListElement>('.appointments');
  const rowTemplate = find<HTMLTemplateElement>('#appointment-row');

  // One row: a copy of the <template>, filled with textContent only.
  const rowFor = (a: Appointment): HTMLLIElement => {
    const row = (rowTemplate.content.cloneNode(true) as DocumentFragment).querySelector('li')!;
    row.dataset.id = a.appointmentId;
    row.querySelector('.when')!.textContent = formatWhen(a); // presentation logic, outside the view (section 9, H1)
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

  // The cancel: the row's button found by its id, a refusal shown.
  subscription.add(
    appointments.cancelState$.subscribe((state) => {
      for (const row of list.querySelectorAll('li')) {
        row.querySelector('button')!.disabled = state.status === 'pending' && row.dataset.id === state.appointmentId;
      }
      cancelError.hidden = state.status !== 'failure';
      cancelError.textContent = state.status === 'failure' ? state.message : '';
    }),
  );

  appointments.list(UPCOMING); // subscribe first, then call
  return subscription;
}
```

Reloading the list after a successful cancel is not in the view: it is a rule of the
application, not of the screen (section 9, H1).

**Pure view state (J5)** lives in the DOM: a section is `hidden` or not, a native `<dialog>` is
open or closed, a form's fields hold their values until submit, read with `FormData`. State the
DOM cannot hold (which week is shown) is one `BehaviorSubject`, outside the view, that the view
subscribes to like any other stream.

**The shell** subscribes to `store.session$` (`docs/FRONTEND_SERVICES.md` sections 9.5 and
11.6): `null` shows and mounts the login section, a session shows the application with the
navigation its `role` allows. Navigation between the screens is the URL's hash (`#/week`,
`#/settings`) read as a stream (`fromEvent(window, 'hashchange')`): on each change the shell
unsubscribes the current view, hides its section, shows and mounts the next. No router library.

**Phone and desktop** are a matter of CSS (grid, media queries): for example the week as seven
columns on a wide screen and one day at a time on a narrow one, from the same markup.

## 8. Testing the views

vitest with a DOM emulation (`happy-dom` or `jsdom`, one development dependency), and no
framework test library.

- The test loads the view's section from `index.html` into the emulated document, so the test
  runs against the real markup: a selector with a typo fails there (C7).
- The mount function gets **fake services**: plain objects whose streams are subjects the test
  controls and whose methods are spies. Emit a state, check the DOM (the button is disabled when
  `pending`; a note with `<script>` in it appears as text); click, check the call. No mocking
  library is needed, because the services are plain classes with public observables and `void`
  methods.

## 9. What this hands over to `docs/FRONTEND_ARCHITECTURE.md`

Nothing below is decided or changed here. If the recommendation is accepted, the architecture
document has these points to settle, besides hosting, CORS and session persistence:

| # | Point | Note |
|---|---|---|
| H1 | **Where the logic between services and views lives.** It may not be in a view, and some of it is not a remote call either: which week is on screen and its Monday; "after a booking or a cancel succeeds, reload" (`docs/FRONTEND_SERVICES.md` section 18.6); a failure `reason` in plain words and times formatted in the calendar's zone (`docs/SHARED_CALENDAR_SPEC.md` section 16.8); whether "cancel" is offered (`cancellableUntil` from `shared/`); telling apart the two 02:00 of the night clocks go back | Proposed direction: pure functions and RxJS pipelines in plain TypeScript, with no DOM, between the two layers, tested like the services. The most important open point: without a home, this logic drifts into the views |
| H2 | The lint rules for the views | Today's import rule on `frontend/src` (root `eslint.config.js`: only `rxjs` and `@shared-calendar/shared`) can stay as it is: the views add no import. To add, for the views: no `innerHTML`, `outerHTML`, `insertAdjacentHTML` (condition 3). If `lit-html` is later added for a view, it is allowed in that folder only |
| H3 | The 100 % line coverage threshold covers all of `frontend/src` (`frontend/vitest.config.ts`) | Decide whether the views are held to it, and add the DOM environment for their tests |
| H4 | The folder for the views, the shell, `index.html` and the CSS, next to `src/services/` | `docs/FOLDER_STRUCTURE.md` section 7 still says "framework not chosen yet" |
| H5 | The bundle command and the dev server (condition 1) | Any bundler that reads TypeScript. esbuild is already a development dependency of the repository; `docs/FOLDER_STRUCTURE.md` section 9 foresees Vite |
| H6 | The Content-Security-Policy of the hosting | One module script, no handler in attributes, no `eval`: a strict policy is possible, also with `lit-html` |
| H7 | Logout is not designed in the services layer (`docs/FRONTEND_SERVICES.md`, status line) | The shell needs it |
| H8 | The language of the interface and its texts | Not asked yet |

## 10. Decisions and assumptions

| # | Decision or assumption | Why |
|---|---|---|
| 1 | The document is an options analysis, named `docs/FRONTEND_VIEW_OPTIONS.md`; it is an input for `docs/FRONTEND_ARCHITECTURE.md`, not a source of truth | Clarification round: view technology only |
| 2 | Options are judged for this application as it is: a finished services layer, about eight screens, thin views | The brief's rule for views; "judge on merit" |
| 3 | Plain HTML/CSS with one module script is recommended, under the four conditions of section 6 | Review of v1: maximum simplicity; `<template>` and a lint rule answer v1's objections on escaping and lists |
| 4 | `lit-html` alone (not Lit's custom elements) is the fallback, added per view on the triggers of section 6 | Sections 4.2 and 4.3: it mixes with plain views; elements add concepts for the same screens |
| 5 | A DOM test per view, against the real markup, is assumed as the answer to unchecked selectors | Section 8; to be confirmed with H3 |
| 6 | Editing never happens inline in a redrawn list (condition 4) | A constraint on the screens' design, accepted for simplicity; lifting it for a view is a trigger for the fallback |
| 7 | Sizes are orders of magnitude from the libraries' own figures; versions are npm's on 2026-11-16 | Not measured: nothing is installed by this document |
