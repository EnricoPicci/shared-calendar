# The conversation behind the conversational architecture

A summary of the session of 2026-11-21 in which the Product Owner (Enrico) and Claude Code
produced `docs/CONVERSATIONAL_ARCHITECTURE.md` from the brief
`prompts/a1-idea-for-conversational-interface.md`. It keeps what explains how we worked and
what we clarified, and leaves out the details.

## How the session went, at a glance

| # | Who | What |
|---|---|---|
| 1 | Enrico | Gives the brief: add a conversational interface, in English and Italian, on the Anthropic API. "Ask any question; start only when everything is clear" |
| 2 | Claude | Reads the project before asking, then asks four questions, each with a recommendation |
| 3 | Enrico | Does not answer yet: asks a question back |
| 4 | Claude | Answers it, and shows how it bears on the open questions |
| 5 | Enrico | Decides the three remaining points in one line |
| 6 | Claude | Researches, writes the document, reports the choices it made alone and what is still uncertain |
| 7 | Enrico | Four rounds of review: "explain this", "make sure that…", "add a diagram", "make the diagrams readable" |
| 8 | Enrico | Turns the last correction into a standing rule |

## 1. The brief

Enrico gave a structured brief: a role (an experienced architect who chooses the simplest
effective design), the context (the application as it is), the goal (Administrator and Users
talk to the calendar: list appointments, find free slots, book, cancel, move, block a time
window), two constraints (English and Italian, the first message sets the language; the
Anthropic API, with the account given at deployment), the task (an architecture document, the
base for an implementation plan), and one instruction on the method: **ask first, start when
everything is clear**.

## 2. Reading before asking

Claude did not ask at once. It first read `docs/ARCHITECTURE.md`, a handler, the deployment
template and the layout of the code, so that the questions were about this application and not
generic. What it found shaped them: the front end is deployed nowhere, the stack costs about
0 € a month, everything must be testable on the laptop, API Gateway cuts a request at 30
seconds.

## 3. Four questions, each with a recommendation

| Question | Options offered | Recommended |
|---|---|---|
| **Channel**: where does the person hold the conversation? | A chat screen in the web app · the API only, for now · an external messenger | Chat screen |
| **Memory**: is a conversation remembered on the server? | Short-lived, on the server · kept as a history · not stored at all | Short-lived |
| **Confirmation**: must the person confirm a change? | Always · only cancellations and deletions · never | Always, enforced by the server |
| **Model**: which Claude model, given that this is the first paid part of the stack? | Opus 5.5 · Sonnet 5.5 · Haiku 5.5, with prices | Left to Enrico: a question of cost |

Everything else (how the tools run, where the key is kept, how it is tested) Claude kept as its
own design decisions, to be explained in the document rather than asked.

## 4. A question back, before answering

> **Enrico:** is it possible to start with a chat screen and then add a channel like whatsapp?

> **Claude:** Yes, and the design can make the second step cheap without building any of it
> now.

The explanation: the assistant becomes a core that does not know the channel; the chat screen
is one thin entry in front of it, a messenger would be a second one. What a messenger would
add later: linking a phone number to an account, a public webhook, acting without the person's
token. The answer also showed that this choice settles part of the other questions: with a
messenger in view the memory must be on the server, and a confirmation must work the same on
any channel.

## 5. The decisions

> **Enrico:** short-lived memory, always confirm, Sonnet 5.5

With the chat screen first and a messenger possible later, the four points were closed and the
work could start.

## 6. The document, and an honest report

Claude checked the facts the design depends on (the Anthropic API's current rules for the
chosen model, AWS's limits and permissions) and wrote `docs/CONVERSATIONAL_ARCHITECTURE.md`.
The key choices it made on its own, each explained in the document with the alternatives
rejected:

- **The assistant adds no calendar logic.** Its "tools" are the existing route handlers, called
  with the caller's identity: it can do exactly what that person can do from the web pages.
- **One request to Claude per HTTP request**, with the screen calling "continue" and showing a
  progress line: it fits the 30 seconds and runs on the laptop.
- **The confirmation is a button, and its text is written by the server**, not by the model:
  what the person confirms is exactly what is run.
- **Only one function can change the calendar**; the ones that read free text and talk to the
  model can only read it.
- **Creating and deleting users stay in the web pages**: the new password must not travel to
  Anthropic.
- **The key is set by an operator's script**; locally Claude is replaced by a scripted fake.

The report did not stop at what was done. It said what Enrico needed to know before planning:
the cost (an estimate, not a measurement, and the need for a spending limit on Anthropic's
side), that data leaves AWS for the first time, two technical points not yet verified and
listed as open, and one thing deliberately not done (the project's `CLAUDE.md` not updated, and
why).

## 7. The review, in four rounds

**"Explain in simple words."** Enrico quoted a sentence of the report about the scripted fake
and the paid evaluation. Claude explained it as two different questions needing two different
tools: *does our code work?* (a fake Claude that always gives the same answer: free, exact,
part of the test gate) and *does Claude understand people?* (only the real model can tell: it
costs money and is not exactly repeatable, so it is run on purpose and kept out of the gate).

**"Make sure that if the Claude budget limit is reached, a nice message is sent to the user."**
A requirement the first draft had missed: it treated the spending limit as a generic outage.
Claude looked up how Anthropic reports that case, gave it its own error code and its own
sentence in the conversation's language, written by us since Claude cannot be asked at that
moment, with no promise it cannot keep ("back next month"), and added a test for it.

**"Add an interaction diagram that explains how the assistant logic works."** The document had
diagrams that each followed one story. Claude added one that shows the logic itself, with every
branch, and rendered it to check that it draws.

**"Make all the diagrams easy to read with the Preview of VS Code."** Enrico had noticed that
one diagram was readable on his dark editor and the others were not. Claude gave all of them a
light background and, instead of trusting the change, rendered each on a dark page and looked
at the pictures. That showed a second problem nobody had asked about, labels printed over each
other in the states diagram, which was redrawn with numbered arrows and a table.

## 8. From a correction to a rule

> **Enrico:** make the "easy to read with VSCode Preview" a rule you apply every time you write
> a diagram

Claude wrote it as a project rule file (`.claude/rules/diagrams.md`), which loads in every
future session, so the correction does not have to be made twice. Applying the new rule to the
one diagram Enrico had liked showed that it did not fully meet it either; Claude fixed it and
said so, since it changed something he had not asked to change.

## What this shows about the way we work

- **A brief with a role, a context, a goal, constraints and a method**, not a one-line request.
- **Questions before work, and reading before questions.** Few questions, only those that are
  the Product Owner's to answer, each with options and a recommendation.
- **The Product Owner can question the questions.** One exchange about WhatsApp changed the
  shape of the design at no cost, because it came before the document.
- **Decisions in one line, design choices explained in the document.** Enrico decided the
  product matters; Claude decided the technical ones and gave its reasons and the alternatives.
- **A report that says what is uncertain**: estimates named as estimates, open points listed,
  what was not done stated.
- **Review in plain language.** "Explain", "make sure that", "add", "make it readable": each
  round small, each answered by a change to the document and a short account of it.
- **Checking instead of assuming**: facts looked up before writing, diagrams rendered and
  looked at, the project's own checks run.
- **A correction made once becomes a rule**, written where the next session will find it.
- **Nothing committed without being asked.**

## What the session produced

| File | What |
|---|---|
| `docs/CONVERSATIONAL_ARCHITECTURE.md` | The architecture of the conversational interface, the base for the implementation plan |
| `.claude/rules/diagrams.md` | The rule for diagrams that read well in VS Code's Preview |
| `prompts/a1-conversation.md` | This summary |
