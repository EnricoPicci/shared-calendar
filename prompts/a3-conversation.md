# The conversation behind step c00

A summary of the session of 2026-11-21 in which the Product Owner (Enrico) and Claude Code
carried out step c00 of `docs/CONVERSATIONAL_PLAN.md`, the first step of the conversational
interface, from the brief `prompts/a3-step-c00-implementation.md`. It keeps what explains how we
worked and what we decided, and leaves out the details.

## How the session went, at a glance

| # | Who | What |
|---|---|---|
| 1 | Enrico | Starts the local stack himself, then gives the brief: one plan step, ten design points already proposed, an acceptance list, one stop at the end |
| 2 | Claude | Reads the documents and the code the brief names, before writing anything |
| 3 | Claude | Writes the code and its tests, runs the quick checks, shows that the key test can fail |
| 4 | Claude | Stops for the one question the brief reserved for Enrico, with three options and a recommendation |
| 5 | Enrico | Answers with one choice |
| 6 | Claude | Writes the documents, runs the whole gate, reports each acceptance point and asks three things for the review |
| 7 | Enrico | Reviews in one line: yes to the first, a different choice on the second, yes to the third but no commit yet |
| 8 | Claude | Applies the three answers, runs the checks again, reports what changed |

## 1. The brief

The brief was longer than the work it asked for, on purpose. It held:

- **what the operator does first**: Enrico starts the local stack in his own terminal. Claude
  neither starts nor stops it;
- **what to read**, document by document and file by file, before any code;
- **where we are**, with the advice to check the repository rather than trust that paragraph;
- **ten design points, already proposed**: the folder, the names of the types, the limits, how
  the fixed texts are organised, which texts belong to this step. "Apply them as written, and
  stop only if the code or a document proves one wrong";
- **what is not in this step**: nothing in the back end or the front end, no dependency, no open
  point of the architecture, no cloud command;
- **the order of authority** when documents disagree: the architecture wins over the plan, and
  the plan over the brief;
- **the acceptance list**, including one unusual request: show that the test on the two
  languages bites, by removing a text and seeing it fail;
- **one question kept for Enrico**: the version number of `docs/ARCHITECTURE.md`, to be asked
  and answered before its entry is written.

Step c00 itself is small: the contract the back end and the screen will share. Seven new error
codes, the type of the assistant's answer, the body of a message, the two languages, the
limits, and the fixed sentences in English and Italian, all in `shared/`, with their tests.

## 2. Reading before writing

Claude read the conversational architecture in full, the plan's opening sections and steps c00
and c01, the existing code of `shared/`, the script that checks the comments, and every place
where the back end and the front end use the error codes, to know in advance whether adding
seven codes could break something there. Nothing it read contradicted the brief's design
points, and it said so before starting to write.

One finding came from this reading. The brief said that version v12 of `docs/ARCHITECTURE.md`
was still marked open. The older plan showed why: closing it was a task of step 59, done
without that line being closed. That turned the question for Enrico from "which number?" into
"who finishes this closing, and how much of it here?".

## 3. The code, and a test shown to bite

The code followed the design points. Where a point left room, Claude chose and wrote the choice
down for the report: for example, a change that the calendar refuses carries the error code of
its route, and the type is written so that the compiler refuses a refused change without its
code.

The fixed texts are one object per language of one type, so a language with a text missing does
not compile. The brief asked to prove that the test catches a mistake, not to assume it. Claude
broke the Italian file twice and put it back:

| What was broken | The compiler | The test |
|---|---|---|
| A text removed from Italian | fails | fails |
| A text left empty | passes | fails |

The second row is the reason the test exists beside the compiler.

The project's own check also caught one mistake of Claude's: a comment in the wrong place in a
test file. It was fixed and mentioned in the report.

## 4. The one question, asked before the documents

> **Claude:** the entry v12 (the calendar's merge) is still marked "open", and the plan says
> step 59 closes it. Where does the entry that opens the merge of the conversational interface
> go?

Three options, each with what it would change and what it would leave: close v12 and open v13
(recommended); add the entry to v12; open v13 and leave v12 as it is. Enrico chose the first.
Claude closed v12 with one sentence, opened v13, and listed in the report the two leftovers of
step 59 it had deliberately not touched.

## 5. The gate and the report

With the documents written, Claude ran the root gate against the local stack Enrico had started:
type check, lint, security audit, template validation, about 3 500 unit tests in the three
packages with full line coverage, and the 90 journey tests. All green.

The report followed the acceptance list point by point and added what Enrico needed to know:

- **a side effect**: the gate's journeys empty the local calendar table, so data made by hand is
  gone;
- **the table of the texts**, English and Italian side by side, because the brief said "the
  Italian texts are yours to write and mine to review";
- **the choices made alone**, each with its reason. Two examples: the second button is not
  "Annulla", which in a calendar would read as cancelling the appointment. And one sentence
  tells the person that the next message starts a new conversation, which is a promise a later
  step must keep;
- **a small slip in the brief**: it said "five rows" and listed six limits. Claude wrote the six
  and said so;
- **three questions for the review**, and a suggested commit message. Nothing committed.

## 6. The review, in one line

> **Enrico:** 1) add the field 2) use the formal form "lei" rather than tu 3) the brief should
> go to the commit but do not commit now

Claude had proposed the informal "tu" for the Italian texts, with its reasons. Enrico decided
otherwise: how the application speaks to its users is the Product Owner's choice. Claude
rewrote every Italian sentence that addresses the person, and ran the checks again.

It also reported three things nobody had asked about:

- the formal label of the second button ("Non lo faccia") is correct but stiff, with a neutral
  alternative offered;
- one sentence now has two "suo" close together, one for the assistant and one for the person;
- it added a line to the architecture recording the choice of "lei", so that the instructions
  given to the model in a later step ask for the same form. It said plainly that this addition
  was its own.

## What this shows about the way we work

- **One plan step per session**, with its own brief, its acceptance check and a stop for review.
  The next step is not started.
- **The brief carries the decisions already taken.** Design points are proposed in advance, so
  the session applies them instead of rediscovering them, and stops only if one proves wrong.
- **The brief also says what not to do**, and who does what: the operator starts the stack, the
  session never touches the cloud.
- **Reading before writing**, including the places a change could break.
- **A question reserved for the Product Owner is asked at its moment**, with options, their
  consequences and a recommendation, and the work that does not depend on it goes on meanwhile.
- **A test is shown to fail before it is trusted.**
- **The report is honest and complete**: every acceptance point, the side effects, the choices
  made alone, the slip found in the brief, what was left untouched and why.
- **A recommendation is not a decision.** Claude proposed "tu" with reasons. Enrico chose "lei"
  in one line, and the change took minutes because the texts live in one place.
- **Each step leaves the documents true**: the architecture, the plan's status, the folder map
  and the project's instructions were updated in the same change as the code.
- **Nothing committed without being asked**, even when the answer to "should this go in the
  commit?" is yes.

## What the session produced

| File | What |
|---|---|
| `shared/src/assistant/` | The contract of the assistant: types, the body of a message, limits, languages, the fixed texts in English and Italian |
| `shared/src/api.ts` | The seven error codes of the assistant |
| `shared/tests/assistant/` | The tests of the contract, with the test on the two languages |
| `docs/ARCHITECTURE.md` | v12 closed, v13 opened for the assistant's merge, the seven codes listed |
| `docs/CONVERSATIONAL_ARCHITECTURE.md` | v3: under way, the field of a refused change named, the formal "lei" recorded |
| `docs/CONVERSATIONAL_PLAN.md` | Step c00 done, with an "As done" note |
| `docs/FOLDER_STRUCTURE.md`, `shared/CLAUDE.md`, `CLAUDE.md` | The new folder, and "under way" in place of "not built" |
| `prompts/a3-conversation.md` | This summary |
