## Brief

Run session 4 of `docs/journeys/PLAN.md`: turn the procedure of sessions 1 to 3 into the project
skill `.claude/skills/explain-journey/SKILL.md`. The batch sessions 5 to 8 use it: one writer agent
and one checker agent per page, each in a fresh context, with nothing but the skill, the page's
target and the repository. So the skill must be enough on its own for an agent that has never seen
sessions 1 to 3. One stop at the end, for review. Commit only when asked.

This session writes the skill and the documents that point at it. It writes no journey page,
changes no test, no source code and no specification.

## Read these in full first

- `CLAUDE.md`, in particular "Where the truth lives", "Comments", the front-end and back-end
  integration notes, and "Test conventions".
- `docs/journeys/README.md`: the reader, the format of a page and the writing rules. The skill
  points at it and never copies it.
- `docs/journeys/PLAN.md`: section 1 (what the skill holds and what it does not), section 2 (how a
  batch session works: writer, checker, main session; who may edit `concepts.md`), section 3 (the
  acceptance check), section 4 (sessions 5 to 8: which pages, grouped how) and section 5 (the
  notes of sessions 1 to 3, the main input of this session).
- `docs/journeys/concepts.md`: what a writer must read first, and the kind of idea that belongs
  there rather than in a page.
- The three pages written by hand, as the examples the skill can name:
  `docs/journeys/frontend/calendar-view.md`, `docs/journeys/backend/calendar-booking.md`,
  `docs/journeys/frontend/calendar-appointments.md`.
- The pointer comments above their `describe` blocks, and how the lint checks them:
  `scripts/doc-references.mjs`, `scripts/eslint-doc-references.mjs` (what a page reference must
  look like for `npm run lint` to accept it).
- `prompts/61-journey-page-session-2.md` and `prompts/62-journey-page-session-3.md`: the briefs of
  the sessions by hand. Their "Read these first", "Rules" and acceptance check are the procedure
  the skill generalises.
- How Claude Code project skills are written (the frontmatter `name` and `description`, when the
  skill is loaded, supporting files beside `SKILL.md`). Check the current documentation rather
  than relying on memory.

## What to write

1. **`.claude/skills/explain-journey/SKILL.md`**, with a `description` that makes it load when
   someone asks to write, check or refresh a journey page. It holds what the README does not
   (`docs/journeys/PLAN.md` section 1, phase 2), in three procedures:
   - **Write a page** for one `describe` block (or one test file without a `describe`). The steps
     in order: what to read (the whole test file once, then the block and every helper it calls;
     the code it reaches; the specification sections and rules its comments and assertions name;
     `concepts.md`; the opening comment of the next block and the end of the block before), the
     running table of the state per test before writing, the page in the format of the README, the
     pointer comment, and the report (disagreements, `concepts.md` additions as text, anything it
     could not trace). Fold in every note of `docs/journeys/PLAN.md` section 5, sessions 1 to 3,
     as a step or a check, not as a story of the sessions.
   - **Check a page**, for the checker agent: given the page and the test, not the writer's
     reasoning. A checklist that traces every "the test checks" bullet to an `expect`, every
     claim about the code or the rules to its source, every reference to its document, every link
     to an anchor that exists; that looks for checks written as behaviour and behaviour written as
     checks, history and gendered wording, and what "What the block leaves" and "If the block
     fails halfway" get wrong. It returns a list of points, each with the line of the page and the
     source that contradicts it, or "cannot trace".
   - **Refresh a page** after its test changed: how to find what changed (the diff of the test,
     the code it reaches), which sections of the page that touches, and the rule that the page
     changes in the same commit as the test (`docs/journeys/README.md`, writing rules).
   Also say, in a few lines, what differs in a batch: a writer does not edit `concepts.md` or the
   README's list of pages, and returns its additions as text; the main session merges them
   (`docs/journeys/PLAN.md` section 2). The back end's journeys empty the table and read stored
   items; the front end's never reset it and reach the API only through the services: name the
   consequences for each, or point at the concepts and notes that do.

   Keep `SKILL.md` short enough to be read in full by every agent. If the checklist or the
   procedures grow long, put them in supporting files beside it (for example `checklist.md`) and
   say in `SKILL.md` when to read each. Name the three pages by path as examples; do not copy their
   text into the skill.

2. **`docs/journeys/PLAN.md`**: session 4's status to "done". Section 5 stays as the record of
   what the sessions by hand learned; add one line saying the skill now holds those notes, so a
   later change goes to the skill. If writing the skill shows that section 2 (how a batch works)
   needs a change, propose it in the report.

3. **`docs/journeys/README.md`** and **`CLAUDE.md`** ("Where the truth lives", the line on
   `docs/journeys/`): one sentence each pointing at the skill for writing, checking and refreshing
   a page. The README keeps the format and the rules; the skill keeps the procedure. Nothing is
   said twice.

## Try the skill before the stop

The skill is proven by using it, not by reading it. Run one **checker** agent, in a fresh context,
with only the skill and the target: check `docs/journeys/frontend/calendar-appointments.md`
against `describe('appointments', …)` of `frontend/tests/integration/calendar.test.ts`. It is a
read-only run: the agent edits nothing. Then:

- every point it returns is either a real fault of the page (list it in the report; fix it only
  once agreed) or a gap in the skill (fix the skill and say what changed);
- if it misses something you know is there, or cannot follow a step, the skill is unclear there:
  fix it.

Do not run a writer agent in this session: the first writers run in session 5, on real pages.

## Rules

- The skill points at `docs/journeys/README.md` for the format and the writing rules, and at
  `docs/journeys/concepts.md` for the ideas. It never restates them, so there is one place to
  change each.
- Every path, helper, section and rule the skill names exists. References in the skill name their
  document by path, as the comment rules of `CLAUDE.md` ask.
- No history in the skill: no sessions, briefs or versions. It describes the procedure as it is.
  Its examples are the three pages by path.
- Commit only the skill's folder and the documents changed here; nothing else under `.claude/`.

## Acceptance check (`docs/journeys/PLAN.md` section 3, adapted to a session without a page)

- `npm run lint` is green at the root.
- `.claude/skills/explain-journey/SKILL.md` exists, with frontmatter that loads it for writing,
  checking and refreshing a journey page, and the three procedures; every note of
  `docs/journeys/PLAN.md` section 5 is in it as a step or a check.
- The checker run on `docs/journeys/frontend/calendar-appointments.md` is done, and each of its
  points is answered: a fault of the page, a gap in the skill now fixed, or a false alarm with the
  reason.
- Session 4 is "done" in the plan; the README and `CLAUDE.md` point at the skill.
- The report lists the skill's files, what the checker run found and what it changed, any change
  proposed to `docs/journeys/PLAN.md` section 2, and anything the batch sessions should know
  before session 5.

Then stop for review.
