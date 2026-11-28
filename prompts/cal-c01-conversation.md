# The conversation behind the design of several calendars

A summary of the session of 2026-11-27 in which the Product Owner (Enrico) and Claude Code
turned the brief `prompts/cal-c01-plan-multiple-calendars.md`, "there can be several calendars,
each owned by an administrator, and a super-user who sees them all", into
`docs/MULTI_CALENDAR_ARCHITECTURE.md` and `docs/MULTI_CALENDAR_SEQUENCE.md`. It keeps what
explains how we worked and what we decided, and leaves out the details, which live in the two
documents.

## How we collaborated

**Enrico was the Product Owner and the challenger.** He brought the requirement and the real
use case, took every product decision, and questioned the design until it could be read by
someone who knows relational databases and not DynamoDB.

**Claude was the architect and the writer.** It read the existing documents, proposed options
with a recommendation, checked the facts in AWS's documentation, and wrote and revised the
documents.

**Enrico's corrections changed the design.** Several of Claude's first recommendations were
wrong or too narrow:

| Claude first proposed | Enrico said | What it became |
|---|---|---|
| A User belongs to one calendar | "I have two personal trainers; I want to book on both with a single sign-in, and I do not want one to know about the other" | One account per person, linked to calendars |
| An invitation that links a person at once | "The user must always accept the invitation" | Every link starts pending and needs the person's Accept |
| No check across calendars, so that nothing leaks | "A slot I picked on one calendar appears as busy on the other" | Busy in one calendar is busy in all, shown to the person only |
| A calendar can be handed to another owner | "Why should we?" | Never handed over |
| A super-user can be invited like anyone | "Why should a super-user be invited to a calendar?" | A super-user is never linked to a calendar |
| The assistant works on one calendar at a time | "Shouldn't it be a better experience if it sees all the calendars the user is linked to?" | One conversation per person, over all their calendars |
| The documents merged into `main` early | "Why not wait for the full implementation?" | One merge, after the release |

**What Claude brought that was not asked for:**

- that Cognito cannot switch an existing user pool to sign-in by e-mail, so a new pool is
  needed;
- the list of what one administrator could learn about another, and the rule that closes it:
  an invitation answers the same whether the person already had an account or not;
- the plain statement that the separation between calendars rests on the code, not on AWS
  permissions, with the tests that prove it;
- the advice against a button, even for the super-user, that creates a ready-to-use User;
- the warning that building before the two languages are merged would cause a large merge.

## How the session went, at a glance

| # | Who | What |
|---|---|---|
| 1 | Enrico | The brief: several calendars, an administrator each, a super-user; design only, new files only; "ask one question at a time, start only when everything is clear" |
| 2 | Claude | Finds nothing to merge from `main`, reads the architecture and the e-mail design, asks the first question: one calendar per User, or several? Recommends one |
| 3 | Enrico | Declines the question to explain first: two personal trainers, one sign-in, and neither must know of the other |
| 4 | Claude | Says it is feasible and describes how; Enrico adds two rules: acceptance, and busy in every calendar |
| 5 | Enrico | Chooses sign-in by e-mail; Claude checks AWS and finds that it needs a new user pool |
| 6 | Enrico | Asks for demo Users made on the fly; Claude advises against a button and offers plus-addresses and the operator's command |
| 7 | Enrico | "Personal trainer was just an example": the role belongs to the link with a calendar, not to the account |
| 8 | Both | The rest of the round: who creates calendars, their life, the existing data, a person's details, the super-user |
| 9 | Claude | Writes the architecture, renders its diagrams, runs the reference check |
| 10 | Enrico | Reviews it: the assistant over every calendar, why one table, a data-model diagram he can read |
| 11 | Enrico | Asks whether the build can start before step m10 of the e-mail plan; the order of the work is found together |
| 12 | Claude | Writes the order in a document of its own; Enrico moves the merge into `main` to the end |

## 1. The first question, and the example that answered a different one

Claude's first question was the one everything hangs on: does a User belong to one calendar or
to several? It recommended one, because the tree super-user, administrator, calendar, User is
the simplest thing to delete, to hand over and to keep private.

Enrico did not answer it. He described his own case: two personal trainers, each the
administrator of their own calendar, himself a client of both, one sign-in, and neither trainer
to know of the other. That was the third of Claude's options, the one it had advised against,
with a privacy rule that made it worth doing properly.

Claude withdrew its advice and described what makes it work: the account belongs to the person
and each administrator only holds a link to it; the administrator types an e-mail address and
gets the same answer whether the person existed or not; nobody chooses a username that could
collide.

## 2. Two rules from the Product Owner

Enrico then added two rules of his own:

- **A person always accepts an invitation.** Claude noted the side benefit: a mistyped address
  no longer gives a stranger a working account, since they must accept first.
- **A time booked with one trainer is busy with the other**, accepting that the second trainer
  then knows the person is linked somewhere, never where. Claude offered two ways to show it and
  recommended the narrower: the person sees "you have another appointment"; the other
  administrator sees nothing, and learns it only when booking that person at that time, with a
  refusal that names no place. Enrico chose it.

## 3. Sign-in by e-mail, and the new user pool

Enrico chose the e-mail address as the sign-in name. Claude checked AWS's documentation and
found the sentence that mattered: "You can't change the username attributes after you create a
user pool". Two ways were left: a new pool, or keeping the pool with the address as the
username itself. Enrico took the new pool: Cognito keeps the address unique, no address is
written on an appointment or in a log, and a person can change address later.

He then asked for Users created on the fly for a demonstration, perhaps by the super-user.
Claude advised against it: the API would again set a password, and the acceptance he had asked
for an hour earlier would have a way around it. Two things do the job instead: plus-addresses
of one mailbox for the real flow, and the operator's command `test-user`, extended, for Users
made at once.

## 4. One kind of account

Claude asked whether "a trainer" is a different kind of account. Enrico stopped it: the trainer
was only an example. Put in the application's words, the question became: is the role a
property of the account, as today, or of the account's relation to each calendar? Enrico asked
which is simpler. Claude answered that the role per calendar is one mechanism where the other
is two, since the link must be read at every request anyway, and it was taken: one kind of
account, the only Cognito group `superuser`.

## 5. The rest of the round

| Point | Decision |
|---|---|
| Who creates a calendar | Only the super-user, naming its administrator, who accepts |
| A calendar's owners | Exactly one, for its whole life |
| Deleting a calendar | Really deleted, after a last Excel backup to its administrator and, added by Enrico, to the super-users |
| Today's data | The set-up is carried over by a script; people and appointments are not |
| A person's details | Typed and corrected by the person; an administrator types only the e-mail address |
| The super-user | Several allowed, each made by the operator's bootstrap script, never linked to a calendar |

On a person's details Claude reversed itself: it had said earlier that each administrator would
keep their own copy, and proposed instead that the person owns them, which Enrico took.

## 6. The architecture, and its review

Claude wrote `docs/MULTI_CALENDAR_ARCHITECTURE.md` with the fifteen decisions, ten proposals of
its own and six open points. Enrico agreed the open points as proposed and changed three things
by asking:

- **The assistant.** Kept to one calendar in the first version. Enrico asked whether seeing
  every calendar of the person would not be better; it was, at no cost to privacy, since a
  conversation is its person's alone. He added that a super-user's assistant sees every
  calendar.
- **Why one table.** Claude's answer, now a section of its own: a table per calendar would not
  separate anything, since the same functions serve all of them; the API would have to create
  AWS resources; and the free capacity is the account's, not a table's.
- **The data model.** Enrico asked for a diagram, then could not read the box "stored twice".
  Claude explained it in relational terms, a junction table and its index, which DynamoDB makes
  the code maintain itself; the diagram became the logical model, one Link box, with the
  storage explained beside the keys.

The document was committed with its brief as `fbedc8f`.

## 7. The order of the work

Enrico asked whether the build could start before step m10 of `docs/EMAIL_PLAN.md`, which waits
for AWS to grant production access to SES. Claude advised against building on `main`, and
against building anywhere before the two languages are merged. Then Enrico found the way out
himself: verify a few addresses, so that mail works in SES's sandbox, and deploy the stage `on`
now. Claude confirmed it in AWS's documentation and added one point: build on the branch, so
that `main` stays deployable. Enrico added the last: merge the branch into `main` once, after
the release.

The order is in `docs/MULTI_CALENDAR_SEQUENCE.md`: verify addresses; the stage `on` in the
sandbox; merge the two languages; several calendars designed again, planned, built and deployed
on its branch, then merged; the real Users invited whenever AWS grants production access.

## 8. Where it stands

- **Committed:** the architecture, v3, and its brief.
- **Written:** the order of the work, and this summary.
- **Not started:** the plan, `docs/MULTI_CALENDAR_PLAN.md`, which waits for its place in the
  order.
- **For other sessions:** step m10 of `docs/EMAIL_PLAN.md` split in two; what the merge of the
  two languages waits for.
- **Not confirmed:** whether the local Cognito emulator signs a person in by e-mail address,
  the one finding that could change the design; whether a verified SES address covers its
  plus-addresses in the sandbox.
