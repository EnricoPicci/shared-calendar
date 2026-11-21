## Before opening the new session (operator, in your own terminal)

```bash
nvm use
DYNAMODB_PORT=8002 npm run local:up -w backend
npm run local:api -w backend          # foreground, in a terminal of its own
```

No AWS login and no Anthropic key are needed: this step touches neither the cloud nor the model.

## Brief

Implement plan step c01, "The table and its module" (`docs/CONVERSATIONAL_PLAN.md`), following
CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then stop for
review. One stop at the end. The design points are proposed below (see "Design points"): apply
them as written, and stop only if the code or a document proves one wrong.

This step gives the assistant its memory, with no model anywhere: the DynamoDB table
`assistant` in the template and in the local stack, and the one module that knows its layout,
`backend/src/lib/assistantDb.ts`. A conversation can be stored, read, moved from state to
state and left to expire. No function, no route and no handler is added: nothing uses the
module yet, and nothing is deployed.

Read these in full first:
- `CLAUDE.md`, in particular "Hard rules from the design" (IAM without wildcards, the AWS SDK
  only under `backend/src/lib`), "Cloud safety", "Comments" and "Changing these files".
- `backend/CLAUDE.md`, in particular "`src/lib/`", "Writing the scripts" and "Tests".
- `docs/CONVERSATIONAL_PLAN.md`: sections 1, 2 and 4, step c01, and steps c02 and c03 to see
  what this step must leave ready.
- `docs/CONVERSATIONAL_ARCHITECTURE.md` v3: sections 4 (one conversation per person, the
  memory, the limits), 5.2 (the states), 5.5 (rule 6: a confirmation runs once), 9 (the table,
  which is the truth for this step), 10.1 (the logs), 11.1 and 11.3 (the template's additions
  and the permissions of each function), 12.1 (the local stack).
- `docs/ARCHITECTURE.md`: the change log (v13), sections 5.3 (how a table is described), 7.1
  (the shared permission sets), 8 (the local stack) and 10 (the capacity).
- `docs/COMMANDS.md` section 3 (the local stack and `env.local.json`).
- `docs/FOLDER_STRUCTURE.md` sections 2 and 3.

Then read the code this step builds on:
- `backend/template.yaml`: `MessagesTable`, `CalendarTable` and the four `Calendar…Policy`
  sets, with their comments. The new resources are written in the same way.
- `backend/scripts/local-seed.sh`, all of it: how a table is created only when missing, and
  the long comment on what `env.local.json` gives to which function.
- `backend/src/lib/db.ts` (the one `documentClient`) and `backend/src/lib/calendarDb.ts`: the
  configuration read once per container with its error class, the conditional transaction, how
  a cancelled transaction's reasons are read (`ConditionalCheckFailed`, `TransactionConflict`).
- `backend/tests/unit/lib/calendarDb.test.ts` and one of its neighbours, for the conventions
  of a test with `aws-sdk-client-mock` and a fixed "now".
- `shared/src/assistant/`: `ASSISTANT_LIMITS`, `AssistantLanguage`, `AssistantStatus`. The
  module uses them and repeats none of them.
- `shared/src/calendar/time.ts`: `localDateOf`, for the date of the daily use.

## Where we are (2026-11-21)

- Step c00 is done and committed (`76f414c`): the contract in `shared/src/assistant/`, the
  seven codes in `shared/src/api.ts`, `docs/ARCHITECTURE.md` v13 open,
  `docs/CONVERSATIONAL_ARCHITECTURE.md` v3, `docs/CONVERSATIONAL_PLAN.md` v2 with the steps
  named c00 to c16. Check `git status -sb` rather than trusting this line: `main` was two
  commits ahead of `origin` at the time of writing.
- `backend/src/lib/` has no `assistantDb.ts`, the template no `AssistantTable`, the local stack
  no table `assistant`.
- The back end's 100 % line threshold covers `src/lib`: the new module comes with its tests.
- This brief file is untracked when you read it. Ask me whether to commit it.

## Design points

Proposed with this brief. Two of them (points 2 and 5) change what
`docs/CONVERSATIONAL_ARCHITECTURE.md` says. Both were decided with the Product Owner before
this step: they are marked, and each is written into that document in this step. None is an open point (P1 to P7) or a finding (F1 to F6) of the plan:
those belong to later steps. P3, the capacity of the table, is closed in step c09: this step
measures nothing.

1. **The table**, in `backend/template.yaml` beside `CalendarTable`, as
   `docs/CONVERSATIONAL_ARCHITECTURE.md` section 9 gives it: `AssistantTable`, named
   `<stack>-assistant`, keys `PK` and `SK` (both strings), provisioned 8 reads / 6 writes, time
   to live on the attribute `expiresAt`, deletion protection off, encryption as the other
   tables, no index and no stream. Its comment says in plain terms what the table holds, why it
   expires and why it is not protected against deletion, as the comments of the two other
   tables do.
2. **Two permission sets, not one** *(changes `docs/CONVERSATIONAL_ARCHITECTURE.md` section
   11.1: decided with the Product Owner before this step)*. That section gives one `AssistantTablePolicy` with four actions, and its section
   11.3 gives `getConversation` "assistant table: read". One set of four actions on a function
   that only reads would grant what its route does not need, against the hard rule. So, like
   the calendar's: `AssistantReadPolicy` (`GetItem`, `Query`) and `AssistantWritePolicy`
   (`PutItem`, `UpdateItem`), each on the assistant table only. Both are attached to no
   function in this step. Nothing in the module deletes an item (point 6), so there is no
   delete set. If the module turns out to need another action, stop and say which and why.
3. **The local stack.** `local-seed.sh` creates the table `assistant` when missing, like
   `calendar`, and switches its time to live on (checked first, so the script stays
   idempotent). `env.local.json` gains `ASSISTANT_TABLE` under "Parameters". No function
   declares that variable yet, so it reaches nobody until step c03: say so in the script's
   comment. DynamoDB Local may never delete an expired item. Nothing may depend on it.
4. **The module's configuration** follows `calendarDb.ts`: `ASSISTANT_TABLE` read once per
   container, on first use, with an error class of its own thrown on use and never at import.
   The module reads no time zone from the environment: what needs one takes it as an argument.
5. **The read of a step is two reads, of the current conversation only** *(changes
   `docs/CONVERSATIONAL_ARCHITECTURE.md` section 9, "one read per step": decided with the
   Product Owner before this step)*. A person's partition also holds the messages of earlier
   conversations until DynamoDB deletes them, which takes days in the cloud and may never
   happen locally, so the module does not read the whole partition and skip. It reads `META`
   first (a consistent `GetItem`), and then, when `META` names a conversation that has not run
   out, only that conversation's messages: a consistent `Query` of `PK = CONV#<sub>` with the
   sort key beginning `MSG#<conversationId>#`, following `LastEvaluatedKey` if there is one.
   With no conversation there is one read, not two. The two reads are not one moment: a write
   may land between them. So the module keeps only the messages whose `seq` is below the
   `nextSeq` of the `META` it read, and the conditional write of point 8 refuses a step built
   on a `META` that has moved.
6. **Ending and replacing never delete.** A new conversation is a new `conversationId` on
   `META` (a ULID, from the `ulid` package the back end already has). Ending one leaves `META`
   saying there is no conversation. The old messages stay until they expire, and
   are never read again: their sort key carries another conversation's id.
7. **The sort key of a message** is `MSG#<conversationId>#<seq>` with `seq` padded to a fixed
   width, so that the messages come back in order from the `Query` itself.
8. **The write of a step is one transaction**: the new message items, the update of `META`
   (status, counters, `lastActivityAt`, the proposal, `version` + 1) on the condition that
   `version` is the one read, and, when the step counts towards the day, the update of the
   daily use (point 11). A condition that fails, or a transaction in conflict, is **not
   retried**: the module throws an error of its own, which the handlers of step c03 will
   answer as `409 assistant_busy`. The first write of a person, when no `META` exists, has its
   own condition (the item must not exist).
9. **Taking a proposal** (`docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.5, rule 6) is one
   conditional update of `META`: the proposal waiting is the one named, and none is being
   executed. It sets `executing` (the proposal's id and the instant) and moves `version` on.
   Of two takes at once, one succeeds and the other gets a plain "not taken" result, not an
   error: step c05 answers it as `404 proposal_not_found`.
10. **Expiry is decided in code, with "now" passed in.** Every item of a conversation carries
    the same `expiresAt`: 48 hours after the conversation started, in epoch seconds. A
    conversation is read as absent when 24 hours have passed since its last message, or 48
    since its first, whatever DynamoDB has or has not deleted. The two lifetimes are named
    constants of this module: they are the back end's own, not part of the contract in
    `shared/`.
11. **The daily use** is the item `USAGE#<sub>` / `<local date>`, with `messages`,
    `inputTokens`, `outputTokens` added by `ADD`, and `expiresAt` 35 days later. The local
    date is the calendar's: `localDateOf` from `shared/`, with the instant and the time zone
    passed in. The module offers the read of today's count and the addition. Whether a person
    may still send a message is the core's decision (step c03), not the module's.
12. **`storedBytes` and `messageCount`** are kept by the module at every write: the bytes are
    the UTF-8 length of what is stored as each message's `content`, and the count is the
    messages of the person only (the 40 of `ASSISTANT_LIMITS`). The module keeps them right and
    exposes them. Whether the conversation is full is again the core's decision.
13. **What the module does not know yet.** The `content` of a `model` message is whatever is
    exchanged with Claude, which arrives in step c02, and the inside of a proposal arrives in
    step c05. The module stores both as given, typed as loosely as that requires and no more:
    it types what it reads itself (`conversationId`, `language`, `status`, the counters,
    `promptVersion`, the proposal's id, `executing`, `version`, `expiresAt`). Say in the
    report which types the later steps will have to narrow.
14. **No log line in this step.** The module logs nothing. The log lines belong to the
    handlers and to the core, from step c03.

## The step

Only what `docs/CONVERSATIONAL_PLAN.md` step c01 lists.

- **Code:** `backend/template.yaml` (points 1 and 2), `backend/scripts/local-seed.sh` (point
  3), `backend/src/lib/assistantDb.ts` (points 4 to 13).
- **Tests**, unit, with `aws-sdk-client-mock` and a fixed "now"
  (`backend/tests/unit/lib/assistantDb.test.ts`, split in several files if it grows as the
  calendar's did):
  - every state change of `docs/CONVERSATIONAL_ARCHITECTURE.md` section 5.2, as the write it
    produces;
  - the read: `META` first, then the messages of its conversation only. No second read when
    there is no conversation or it has run out. A message written between the two reads left
    out by its `seq`;
  - a first write, and a write refused because the version moved, by a failed condition and
    by a transaction in conflict;
  - two takes of one proposal. A take of a proposal that is not the one waiting;
  - a conversation run out read as absent: 24 hours after the last message, 48 after the
    first, and one second before each;
  - starting, ending and replacing a conversation. The messages of an earlier conversation
    never asked for. A read of the messages that takes more than one page;
  - `storedBytes` and `messageCount` kept right, with a text that is not ASCII;
  - `expiresAt` on every item written;
  - the daily use on the calendar's date: just before and just after local midnight, and on
    the two nights the clocks change;
  - the configuration: the variable missing, and the error kept for the next call.
- **Documents:**
  - `docs/ARCHITECTURE.md`: the sentence of step c01 in the v13 entry. A new section for the
    table `assistant` beside 5.3 (its settings and its three items, taken from
    `docs/CONVERSATIONAL_ARCHITECTURE.md` section 9 and corrected to what was built). Section
    7.1: the two permission sets. Section 8: the table in the local stack, and that expiry
    does not depend on DynamoDB Local. Section 10: the capacity total, 19 / 17.
  - `docs/CONVERSATIONAL_ARCHITECTURE.md` v4: the status line (steps c00 and c01 done), the
    change log, section 11.1 with the two sets (point 2), section 9 with the two reads
    (point 5) and with anything else the implementation proved different.
  - `docs/CONVERSATIONAL_PLAN.md`: the status line (step c01 done, with its date and this
    brief). If the step differed from its text, an "As done" note under it.
  - `docs/FOLDER_STRUCTURE.md`, `backend/CLAUDE.md` ("`src/lib/`": one entry for
    `assistantDb.ts`, as short as the module allows) and `docs/COMMANDS.md` (the new table and
    `ASSISTANT_TABLE` in the local stack). Look for any other place that lists the tables or
    the files of `src/lib`: `grep -rn "hello-messages" README.md docs backend/CLAUDE.md`.
  - `CLAUDE.md` only if a line of it became untrue. Report its line count.

Not in this step:
- any function, route or handler, and any role that uses the new sets (steps c03 and c05);
- `backend/src/lib/anthropic.ts`, the key, the fake Claude (step c02);
- `backend/src/assistant/` and the tools (from step c03);
- anything in `shared/` or `frontend/`. If the module needs something `shared/` does not
  give, stop and say what;
- any change to the calendar: its table, its sets, its module, its handlers;
- any dependency;
- the open points P1 to P7 and the findings F1 to F6. If this step runs into one, report what
  you saw and leave it to its step;
- the cloud: no deploy, and no `aws` command against a real account.

## How we work in this step

- **The local stack:** I start it, before the session. After you change `local-seed.sh`, run
  `DYNAMODB_PORT=8002 npm run local:up -w backend` yourself: it is idempotent and local. Do
  not run `local:down`. `local:api` is mine: if it needs a restart, tell me and wait.
- **The AWS CLI against the local emulator** (dummy credentials, `--endpoint-url
  http://localhost:8002`) is allowed for reading: `describe-table`, `describe-time-to-live`.
  It is how you show that the table is there.
- **Hard rules:**
  - no wildcard action or resource in a policy. Each set names the assistant table only;
  - the AWS SDK is imported only under `backend/src/lib`;
  - the existing tests keep passing unchanged. If one must change, say which and why;
  - the shell script runs on macOS (bash 3.2) and Linux: no flag that differs between the two;
  - comments follow CLAUDE.md "Comments": a reference names its document by path, in the same
    sentence. No brief or step name in a comment;
  - infrastructure changes are explained in plain terms, in the template's comments and in
    the report: the reader is not an Infrastructure-as-Code expert.
- **When `docs/CONVERSATIONAL_ARCHITECTURE.md`, the plan and this brief disagree, or one is
  unclear or proves wrong**, stop and tell me, with a proposed change. The architecture wins
  over the plan, and the plan over this brief, except for points 2 and 5, which the Product
  Owner decided before this step. Do not edit the rules silently.

## Acceptance (`docs/CONVERSATIONAL_PLAN.md` step c01)

- The design points applied as written (any deviation reported with its reason).
- `npm run typecheck`, `npm run lint` and `npm run test:unit` green at the root.
- 100 % line coverage of `backend/src/lib`, the new module included.
- `sam validate --lint` passes with the new resources (it is part of the gate: show its line).
- After `local:up` the table `assistant` exists in the local stack, with its keys and its time
  to live on `expiresAt`: show the two `describe` answers. I look at it in dynamodb-admin at
  the review. A second `local:up` changes nothing.
- The root gate, `DYNAMODB_PORT=8002 npm run verify`, green. It runs the back end's calendar
  journeys, which empty the local `calendar` table: say so in the report.
- `docs/ARCHITECTURE.md` has the table's section and the capacity total 19 / 17 in its section
  10.
- In the report: the list of what the module exports, in one line each. What a later step
  must narrow (point 13). The two reads of a step, and what each costs (point 5). In plain words, what the
  template gained.

Report each result, including anything you could not run, then stop for review. Suggest the
commit, but commit only when I ask. Do not push. Do not start step c02.
