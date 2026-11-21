## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend
npm run local:api -w backend          # foreground, in a terminal of its own
```

No AWS login and no Anthropic key are needed: this step touches neither the cloud nor the model.

## Brief

Implement plan step c00, "Shared: the contract" (`docs/CONVERSATIONAL_PLAN.md`), the first step
of the conversational interface, following CLAUDE.md's working rhythm: one step, its acceptance
check, an honest report, then stop for review. One stop at the end. The design points are
proposed below (see "Design points"): apply them as written, and stop only if the code or a
document proves one wrong.

This step writes what the back end and the screen will agree on: the new error codes, the type
of the assistant's answer, the body of a message, the languages, the limits, and the fixed
texts in English and Italian. It is types, schemas, constants and texts in `shared/`, with
their tests. It changes nothing in `backend/` or `frontend/`, and nothing in the cloud.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design" (`shared/` imports only TypeScript
  and `zod`. A new error code starts in `shared/src/api.ts`), "Comments" (`npm run lint`
  enforces it), and "Changing these files".
- `shared/CLAUDE.md`.
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4 (how the steps are run, what is open and
  in which step, what every step does), step c00, and step c01 to see what this step must leave
  ready.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` v2: sections 1, 4 (the language, the limits), 5.5 (the
  rules of a proposal, for the texts they need), 6 and 6.1 (the contract and the three
  sentences, which are the truth for this step), 7.4 (the fixed sentences of "cut short" and
  of a refusal), 13 (which words are the front end's own and stay English), 18.
- `docs/FOLDER_STRUCTURE.md` sections 2 and 3.
- The change log and section 4 of `docs/ARCHITECTURE.md`.

Then read the code this step builds on:
- `shared/src/` all of it, above all `api.ts`, `index.ts`, `calendar/defaults.ts` and
  `calendar/schemas.ts` (the `Ulid` primitive, how a body's schema is written and named).
- `shared/tests/` for the conventions, `shared/vitest.config.ts`, `shared/tsconfig.json`.
- `scripts/check-doc-references.mjs`: a comment that points at
  `docs/CONVERSATIONAL_ARCHITECTURE.md section 6.1` must pass it. Check that the script knows
  the document and how it reads a section such as 6.1 before writing the comments.
- Where `ApiErrorCode` is used in `backend/src` and `frontend/src`: adding codes to the union
  must break nothing there. If it does, stop and say where.

## Where we are (2026-11-21)

- The calendar, its services layer and its view layer are done (`docs/IMPLEMENTATION_PLAN.md`
  steps 1 to 57 and 59, `docs/FRONTEND_VIEW_PLAN.md` steps 60 to 69). Step 58 of
  `docs/IMPLEMENTATION_PLAN.md` (the old stack) is independent of this step. Do not touch it.
- The assistant is a proposal with a plan: `docs/CONVERSATIONAL_ARCHITECTURE.md` v2 (`51feb49`)
  and `docs/CONVERSATIONAL_PLAN.md` v1 (`8ffbe1a`). Nothing of it is built. Check
  `git status -sb` rather than trusting this line: `main` was one commit ahead of `origin` at
  the time of writing.
- `shared/` holds `api.ts`, `roles.ts`, `username.ts`, `index.ts` and `calendar/`. No
  `assistant/` folder yet.
- `docs/ARCHITECTURE.md` is at v12, still marked open. See "Documents" below.
- This brief file is untracked when you read it. Ask me whether to commit it.

## Design points

Proposed with this brief. None of them is an open point of the architecture (P1 to P7) or a
finding of the plan (F1 to F6): those belong to later steps and are not touched here.

1. **The folder is `shared/src/assistant/`**, with tests in `shared/tests/assistant/`:
   - `types.ts`: the types of point 3;
   - `schemas.ts`: the schema of point 4;
   - `limits.ts`: the constants of point 5;
   - `languages.ts`: the list of point 6;
   - `texts.ts`, `texts.en.ts`, `texts.it.ts`: the texts of points 7 to 9.

   `shared/src/index.ts` re-exports each. Consumers keep importing from
   `@shared-calendar/shared` only.
2. **The seven codes** go into `ApiErrorCode` in `shared/src/api.ts`, as a group of their own
   with one comment line naming `docs/CONVERSATIONAL_ARCHITECTURE.md section 6`, each with its
   status beside it: `assistant_busy` (409), `conversation_full` (409), `nothing_to_continue`
   (409), `proposal_not_found` (404), `assistant_limit_reached` (429), `assistant_unavailable`
   (503), `assistant_budget_reached` (503). No existing code changes.
3. **The types**, as `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6 gives them, with these
   names: `AssistantLanguage`, `AssistantStatus`, `AssistantMessage` (`seq`, `from`, `text`,
   `at`), `AssistantProposal`, `AssistantProposalAction`, `AssistantReply`. One thing the
   document leaves unnamed: a refused action "carries the route's error code". Proposal: the
   action is `{ summary, outcome, error }`, where `error` is an `ApiErrorCode` when `outcome`
   is `'refused'` and `null` otherwise. Write it so, and say it in the report so that the
   review can add the field's name to the document.
4. **The body of `POST /assistant/messages`** is one `zod` schema, named after the calendar's
   bodies in `calendar/schemas.ts`: a strict object (any other field refused) with `text`,
   trimmed, 1 to 2 000 characters after trimming. The proposal's id in a path reuses the
   existing `Ulid`: no new schema for it.
5. **The limits** are the five rows of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 4.4 and
   nothing else, as named constants: the length of a message (2 000), the messages of a person
   per day (30, the default the deployment parameter will carry), the messages in one
   conversation (40), the stored size of one conversation (100 KB, written as 100 000 bytes),
   the requests to Claude for one message (8), the changes in one proposal (5). The schema of
   point 4 uses the first. The lifetimes of a conversation and the cap of a tool's result are
   the back end's own and arrive with their steps (c01 and c04).
6. **The languages** are one `as const` list, `['en', 'it']`, with `AssistantLanguage` derived
   from it and `en` named as the default. A `zod` schema of the list is exported too: the
   language question of step c03 will constrain its answer with it.
7. **The texts are one object per language, of one type.** `texts.ts` declares the type
   `AssistantTexts` and exports `assistantTexts(language)`. `texts.en.ts` and `texts.it.ts`
   each export one object of that type. A text that carries a value is a function of that
   value, never a string with a placeholder cut and pasted by the caller. TypeScript then
   already refuses a language with a text missing. The test asked by the plan checks at run
   time what the compiler does not: the two objects have the same keys, and every text is a
   non-empty string for a sample of its arguments.
8. **Which texts, in this step.** Only those no tool owns:
   - the three sentences of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1, the English
     ones word for word as that section gives them, keyed so that the screen can pick one by
     its error code;
   - "Nothing was changed." (a declined or dropped proposal);
   - "The answer was cut short." (its section 7.4);
   - the sentence when the requests for one message are used up, asking to put the request
     differently (its section 4.4);
   - the sentence of a refusal by Anthropic's filters (its section 7.4);
   - the sentence when a conversation is full, offering a new one;
   - the labels of the proposal's two buttons, and the question's opening words for one change
     and for several;
   - one general progress line ("Working…").

   The confirmation's wording of each change and the progress line of each read ("Looking at
   the calendar…") arrive with the tool they belong to, in steps c04 to c08.
9. **The Italian texts are yours to write and mine to review.** Write them as an Italian
   speaker would say them to a person, with the formal or informal address chosen once and
   kept: propose which, and say why. The report lists every text of point 8 in two columns,
   English and Italian. I read them at the review.
10. **The front end's own words stay out.** "Assistant", "New conversation", "Send" are English
    only and belong to `frontend/` (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 13). Nothing
    of them is written in this step.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c00 lists.

- **Code:** `shared/src/api.ts` (the seven codes), `shared/src/assistant/` (point 1),
  `shared/src/index.ts`.
- **Tests**, in `shared/tests/assistant/`:
  - the body's schema: a text of 1 and of 2 000 characters accepted. An empty one, one of only
    spaces and one of 2 001 refused. Spaces around a text trimmed before the count. Another
    field refused. A `text` that is not a string refused;
  - the languages: the list, the default, the schema accepts the two and refuses a third;
  - the limits: the values, so that a change of one is a change somebody sees in a test;
  - the texts: point 7's test. Each of the three sentences of section 6.1 reachable by its
    error code in both languages;
  - a type-level check, in the test file, that an `AssistantReply` written as the example of
    `docs/CONVERSATIONAL_ARCHITECTURE.md` section 6 compiles.
- **Documents:**
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v3: status "under way: step c00 of
    `docs/CONVERSATIONAL_PLAN.md` done". In section 1, "Where it stands", one sentence: from
    this step on, each part of the assistant is governed by `docs/ARCHITECTURE.md` and the two
    front-end documents from the step that merges it into them. The change log. The name of
    the refused action's field (point 3) only after my go at the review.
  - `docs/ARCHITECTURE.md`: a change-log entry that opens the merge of the conversational
    interface, as v12's entry opened the calendar's. **Its version number is a question for
    me**: v12 is still marked open although the calendar is deployed. Propose either closing
    v12 here and opening v13, or adding the entry to v12, and wait for my answer before
    writing it. Section 4 gains the seven codes in its list of error codes, each marked "the
    assistant, not answered by any route yet".
  - `docs/CONVERSATIONAL_PLAN.md`: the status line (step c00 done, with its date and this
    brief). If the step differed from its text, an "As done" note under it.
  - `docs/FOLDER_STRUCTURE.md`: `shared/src/assistant/` in the tree of section 2 and wherever
    `shared/src/calendar/` is described.
  - `shared/CLAUDE.md`: one line for `src/assistant/` in the folder map.
  - `CLAUDE.md`: the pointer line says the assistant is "not built". Make it true in the same
    one line. The file stays under 200 lines: report its count.

Not in this step:
- anything in `backend/` or `frontend/`, the template, the local stack's scripts. If a point
  needs a change there, stop and say why first;
- the table, the model's module, the fake Claude, any handler (steps c01 to c03);
- the texts of any tool, and any tool's schema (steps c04 to c08);
- any dependency. `shared/` keeps `zod` and nothing else;
- the open points P1 to P7 and the findings F1 to F6 of `docs/CONVERSATIONAL_PLAN.md` section
  2. If this step runs into one, report what you saw and leave it to its step;
- the cloud: no deploy, no AWS command.

## How we work in this step

- **The local stack:** I start it, before the session. The root gate needs it. Do not start or
  stop it yourself. If the gate cannot reach it, tell me.
- **Hard rules:**
  - `shared/` imports no AWS SDK, no Node-only module and no DOM API;
  - the existing tests keep passing unchanged. If one must change, say which and why;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence, and the section it names must exist and say what the comment claims. No brief or
    step number in a comment;
  - a text of the server never promises what it cannot keep
    (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 6.1: no "back next month");
  - no AWS command and no deploy.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan and this brief disagree, or one is
  unclear or proves wrong**, stop and tell me, with a proposed change. The architecture wins
  over the plan, and the plan over this brief. Do not edit the rules silently.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c00)

- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root: the new codes
  break nothing in `backend/` or `frontend/`.
- 100 % line coverage of `shared/src`, the new folder included.
- `shared/` still imports only TypeScript and `zod`: show the imports of the new files.
- The test on the two languages passes, and is shown to bite: a text removed from one language
  fails it (or fails the typecheck: say which), then is put back.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green. It runs the back end's calendar
  journeys, which empty the local `calendar` table: say so in the report.
- The table of the texts, English and Italian, for my review.
- The documents updated, the question on the version of `docs/ARCHITECTURE.md` asked and
  answered before its entry is written.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c01.
