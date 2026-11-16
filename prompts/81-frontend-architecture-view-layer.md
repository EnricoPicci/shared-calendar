## Brief

Consolidate the decision on the front end's view layer, taken on 2026-11-16 after brief
`prompts/80-design-view-layer.md`: **the views are written in plain HTML and CSS, with one
TypeScript module script**. Write the first version of `docs/FRONTEND_ARCHITECTURE.md`, the
document the repository has been waiting for (`CLAUDE.md`, `docs/FOLDER_STRUCTURE.md` section 7,
`docs/FRONTEND_SERVICES.md`). It writes no application code and installs nothing.

**Scope: the view layer only.** Hosting, the CORS gap, keeping the session across a reload, the
bundle command and the dev server are not decided by this brief. The document lists them as open
points, each with what it blocks, for later versions.

Read these in full first:
- `CLAUDE.md`, in particular "Where the truth lives", "Working rhythm" and "Comments".
- `docs/FRONTEND_VIEW_OPTIONS.md` v2, all of it: the analysis and the recommendation that is now
  the decision. Sections 2, 6, 7, 8 and 9 are the material of the new document.
- `prototypes/README.md` and the plain prototype (`prototypes/view-plain/`, `prototypes/common/`,
  `prototypes/view-plain/LOADING_SEQUENCE.md`): what writing two real views taught.
- `docs/FRONTEND_SERVICES.md`: section 2 (the rules), section 3 (the pattern), sections 9.5, 9.6
  and 10.3, and the "Use from the view layer" sections (4.6, 11.6, 18.6).
- `docs/SHARED_CALENDAR_SPEC.md` section 16.8 (what the views need).
- `docs/FOLDER_STRUCTURE.md` sections 2 and 7.

## What the document must hold

Only what is decided and binding, short enough to be read before writing a view:

1. The decision, and the place of the document among the others: it is the source of truth for
   the view layer; `docs/FRONTEND_VIEW_OPTIONS.md` stays as the record of why, not as a source of
   truth.
2. The layers of the front end and which may use which: the services, the logic between the
   services and the views (point H1 of `docs/FRONTEND_VIEW_OPTIONS.md` section 9), the views, the
   shell.
3. The rules of a view: what a view may do, the four conditions of
   `docs/FRONTEND_VIEW_OPTIONS.md` section 6, and what the prototypes added (leaving a view,
   positions under a strict Content-Security-Policy).
4. The shape of a view, with one small example, and how the HTML and the TypeScript meet.
5. The logic layer: what belongs in it and its rules.
6. The shell: the session decides between the login and the application; navigation.
7. `lit-html` as the fallback for a single view: when, and how it is kept apart.
8. How the views are tested.
9. Where the files go in `frontend/`.
10. The open points, numbered `O…`, each with a proposed direction where one exists and with
    what it blocks (the first view, the first run in a browser, the first deployment).
11. A table of decisions and assumptions, with the reason for each. Anything you decide beyond
    what `docs/FRONTEND_VIEW_OPTIONS.md` recommended or the prototypes showed is marked as such.

Code in the document is illustration, self-contained: the `prototypes/` folder is throw-away and
the document must still read correctly after it is deleted.

## In the same change

- `docs/FRONTEND_VIEW_OPTIONS.md`: the status line and the change log say that the recommendation
  was accepted and where the rules now live. Nothing else in it changes.
- `CLAUDE.md` ("Where the truth lives", and the lines that say the front end waits for its
  architecture document) and `docs/FOLDER_STRUCTURE.md` section 7 ("framework not chosen yet"):
  brought in line, no more than needed.
- `npm run lint` at the root stays green.

## Do not

- Do not delete `docs/FRONTEND_VIEW_DISCUSSION.md` or `prototypes/`, and do not commit: neither
  has ever been committed, and I decide both after reading the document.
- Do not add plan steps to `docs/IMPLEMENTATION_PLAN.md`: the order of work for the views comes
  after the review of this document.
- Do not change `frontend/`, `shared/`, `backend/`, `eslint.config.js` or any `package.json`.

## Report

What the document decides, what it leaves open, and every point where you decided something I
have not seen before, so that I can review those first.
