# Check a page

For the checker: given a page and its test, find what the page gets wrong. You work from the
page, the test file and the repository; you do not need, and should not ask for, the writer's
reasoning. Read `SKILL.md` first. A check is read-only: edit nothing, return the list of points.

## Before the checklist

Read the page once. Then read, as `write.md` section 2 says, the whole test file once, the block
in full with every helper it calls, the block before and the opening comment of the next block.
Read the code and the documents as each point below needs them.

## The checklist

Go through the page section by section. For each item, a doubt is a point (see "Report").

### The header and the frame

1. The test file and the `describe` name are exact; the tests are every `it` of the block, in
   order, with their names as written (only the numbering added).
2. "Runs against" matches the package: the back end also needs DynamoDB Local on `DYNAMODB_PORT`.
3. The line "Ideas used here" is there, and it holds exactly the `docs/journeys/concepts.md`
   sections the page relies on: none it does not use, and every one the page links to further
   down (a section linked only in the story and missing from the line is a point).
4. "What this block proves" names rules and scenarios each with its document, and each one is
   really exercised by a test of the block. A claim about who does what ("as a User and as the
   Administrator", "every call goes through one service") holds for every call it covers: check
   it call by call.
5. "Who takes part" and "Before the block starts" match the file's and the block's `beforeAll`
   (including those a helper registers), and what the blocks before leave.

### Every "the test checks"

6. Each bullet or sentence that says "the test checks" (or "In the table, the test checks that")
   traces to an `expect` of that test, or to one inside a helper it calls (`noRequest()`,
   `restoreSettings()`), or to a helper that fails the test when a call does not succeed (`ok()`).
   Same value, same field, same order where the test checks an order (`toEqual` on a list of ids).
7. The other way round: each `expect` of the test is told on the page, or its omission does not
   change the story. A missing check is a point only when it matters (a whole kind of assertion
   left out, a stored item not mentioned).
8. **Checks written as behaviour, behaviour written as checks.** A sentence that states as a check
   something no `expect` checks is a point, even when it is true; so is a sentence that tells an
   `expect` as a mere remark when it is the test's point.
9. Checks on stored items are in their own group, after the checks on the answers
   (`docs/journeys/README.md`, "The format of a page", item 6).

### Every claim about the code

10. Each claim about what a handler, a module, a service, a schema or a helper does is true in
    that code: names (functions, streams, routes, fields, error codes, constants) as spelled
    there; the order of checks as the code runs them.
11. On the front end, per call: the method, the stream its result arrives on (as in the service,
    not as in `docs/SHARED_CALENDAR_SPEC.md` section 16.2) and the route. Per refusal: whether a
    request leaves (count them: `noRequest()` or a `fetch` spy), and that the page says which side
    decided.
12. Per list: the server's filter and the test's filter both stated correctly, and the reason a
    count can be trusted holds. On the front end, where the table is never reset, every count and
    every "free" date has a reason that is true in the helpers (`freeDate()`, the band,
    `BAND_OFFSET`, this run's accounts). A sentence with "all", "only", "none" or "every" about a
    date or a list must be scoped to what is true: "this block's three appointments", not "the
    three appointments on `D`" when the block before may have left more there.
13. The state: every answer the page explains holds given everything before it. Rebuild the
    running state yourself (`write.md` section 3) for any test whose answer depends on earlier
    tests, and compare it with the page's state tables.

### Every reference and every link

14. Each reference names its document by path and the item exists there and says what the page
    claims: `docs/SHARED_CALENDAR_SPEC.md` R-… rules, sections, AC-… scenarios, route numbers of
    section 11.1, decisions; `docs/FRONTEND_SERVICES.md` sections and decisions. No nickname
    ("spec 8.4"), no bare item.
15. Each Markdown link points at a file that exists, and each `#anchor` at a heading that exists
    in it. An anchor is the heading in lower case, with backticks and punctuation other than `-`
    removed and spaces made `-` ("The front end's services in the journeys" →
    `#the-front-ends-services-in-the-journeys`). Nothing checks links automatically: check each
    one.

### Wording

16. No history: no versions, briefs, "since step N", "now" about the code's past.
17. No gendered words for the test users ("he", "his", "she", "her"): their names, or "they",
    "themself".
18. Code named by name, never by line number.
19. Anything only this block uses stays on the page; anything another journey could use is in, or
    proposed for, `docs/journeys/concepts.md`, not explained again on the page.

### The ends of the block

20. **"What the block leaves"**: rebuild it from the state at the end of the last test plus the
    block's `afterAll`. Compare with the opening comment of the next block (what it expects); when
    that comment says nothing about it, compare with what the next block's tests and `beforeAll`
    actually need from the state. Check
    each row: status, owner, who booked, who cancelled, the events. History (cancelled
    appointments, events, markers) is named.
21. **"If the block fails halfway"**: for a failure in each test, what the rest of that test
    skips (settings put back at the end of a test, or in the last test, are skipped; an
    `afterAll` or a `finally` is not); which later tests still run and whether they depend on the
    failed one; how users are removed (`removeUserIfPresent()` in
    `backend/tests/integration/setup.ts` writes no marker and cancels nothing;
    `DELETE /users/{username}` does both); what the next run's `beforeAll` cleans up.
22. **"Where in the code"**: every service, route, helper and constant named exists, in the file
    named.

### The pointer comment

23. The pointer comment is where `docs/journeys/README.md` ("Writing rules", "The pointer
    comment") puts it, with the page's exact path. `npm run lint` at the root passes.

## Report

Return a list of points, in the order of the page. Each point has:

- **where**: the line of the page (its number, and a few words quoted);
- **what is wrong**, in one sentence;
- **the source** that contradicts it: the file and the name in it (the test, the helper, the
  function), or the document and its section or rule. When no source confirms or contradicts the
  claim, write **"cannot trace"** and say what you looked at.

Then, separately, anything in this checklist you could not follow, and why. Say "no points" when
there are none; do not pad the list with matters of taste.
