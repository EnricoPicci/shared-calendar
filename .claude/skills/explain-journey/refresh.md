# Refresh a page after its test changed

A test with a page changes; its page changes **in the same commit** (`docs/journeys/README.md`,
"Writing rules"). The pointer comment above the `describe` names the page, so whoever changes the
test sees it in the same diff. Read `SKILL.md` first.

## 1. Find what changed

- **The test**: `git diff` of the test file (uncommitted: `git diff -- <file>`; since the page was
  last written: `git log --oneline -- <page>` for the page's last commit, then
  `git diff <that commit> -- <test file>`). Look at the block itself, the file's
  `beforeAll`/`afterAll`, every helper the block calls (also in
  `backend/tests/integration/setup.ts` or `frontend/tests/integration/local.ts`), and the blocks
  just before and after it.
- **The code it reaches**: the same `git diff` over what the block calls (`write.md` section 2,
  item 4): handlers and `backend/src/lib/`, the services in `frontend/src/services/`, the shared
  schemas in `shared/src/calendar/schemas.ts`. A change there can change an answer, an error code
  or a name the page quotes without the test changing.
- **The documents**: the sections and rules the page references, in `docs/SHARED_CALENDAR_SPEC.md`,
  `docs/FRONTEND_SERVICES.md`, `docs/ARCHITECTURE.md` (their change logs say what moved), and
  `docs/journeys/concepts.md` sections the page links to.

## 2. Map each change to the page

| Change | Sections of the page it touches |
|---|---|
| an `it` added, removed, renamed or moved | the header table (numbering), every "test N" reference on the page, the story's headings, "What this block proves" |
| an `expect` added, removed or changed | that test's "the test checks" bullets (and "In the table" group) |
| a call, a helper or a value changed (a time, a date, a setting) | the story of that test, **and every later test that depends on the state** (rebuild the running state, `write.md` section 3), the state tables |
| the block's or the file's `beforeAll`/`afterAll`, or the clean-up helpers | "Before the block starts", "What the block leaves", "If the block fails halfway" |
| the block before or after changed | "Before the block starts" (what it leaves), "What the block leaves" (what the next one expects) |
| a service, route, stream, helper or constant renamed | "Where in the code" and every mention in the story |
| a rule or section moved in a document | each reference to it, and "What this block proves" |
| an idea in `concepts.md` changed or renamed | the links of "Ideas used here" and in the story (anchors) |
| the `describe` renamed | the header table; the page's file name if `docs/journeys/README.md` ("Layout") calls for another one, then the pointer comment and the README's list of pages |

## 3. Rewrite, then check

- Rewrite the touched sections with the steps of [`write.md`](write.md) (sections 3 to 7), not
  only the sentences the diff names: a changed state early in a block can change the answers of
  later tests.
- Run [`check.md`](check.md) on every section you changed and on every section that depends on the
  state you changed.
- Run `npm run lint` at the root.
- Report as in `write.md` section 8, and say which sections changed.
