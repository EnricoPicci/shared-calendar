# The conversation behind step m10, part A: e-mail switched on in SES's sandbox

A summary of the session of 2026-11-28 in which the Product Owner and operator (Enrico) and
Claude Code cut step m10 of `docs/EMAIL_PLAN.md` in two, from the brief
`prompts/mail-m10-split-step-m10.md`, then ran its part A, from the brief
`prompts/mail-m11-stage-on-part-a-deploy.md`: the stack `shared-calendar-api` at `MailStage=on`
while AWS still keeps the account in SES's sandbox. It keeps what explains how we worked and what
we decided, and leaves out the details, which live in the plan and in `docs/RUNBOOK.md` section
5.11.

## How we collaborated

Two roles, kept apart on purpose, each with what only it could bring.

**Enrico, Product Owner and operator.** He set the goal and the limits (documents only in the
first brief, one go per cloud command in the second), took every decision that was his to take
(which test User receives mail, whether to push, whether to delete the verified addresses, the
one exception to the no-wildcard rule), and held everything that touches the real world: the
SES console and its verified addresses, the three deploys typed with `y` in his own terminal,
the three smoke tests, his mailbox, the page, the Excel files opened by hand. He also asked the
questions that changed the course: "why should I delete the verified addresses?", "would it
change with my plain address?", "explain the cheap test in simple words", "make sure the
wildcard is removed in part B".

**Claude Code, analyst, writer and reader of the cloud.** It read AWS's documentation and cited
each page, wrote and corrected the plan, the architecture and the runbook, made the small code
fixes with their tests, ran `verify` before each deploy, read every change set before Enrico's
`y`, and looked at the cloud through read-only commands only, always by fields, never printing
an e-mail address, a password or an account id. When something failed it stopped, said what it
saw, proposed a way, and waited.

What made it work: a clear line between deciding and executing, short messages with one
question at a time, and the habit of proving a guess before acting on it (the simulator test,
the CloudTrail and log reads, the bytes of the broken file).

## How the session went, at a glance

| # | Who | What |
|---|---|---|
| 1 | Enrico | Brief m10: cut step m10 in two, A in the sandbox, B after production access |
| 2 | Claude | Reads AWS's pages on the sandbox; writes plan v14, architecture 13.2, runbook 3.3 |
| 3 | Enrico | "Did you say why we split?" Then: "why delete the verified addresses?" |
| 4 | Claude | Admits the reason was weak; the deletion becomes optional |
| 5 | Claude | Writes brief m11 for part A; Enrico starts it |
| 6 | Both | Read-only start: domain `SUCCESS`, sandbox, four addresses already verified |
| 7 | Enrico | `miri` receives mail, `enri` kept away; the commits pushed |
| 8 | Both | Deploy 1 at `on`: 32 changes, the pool Modify, read before `y` |
| 9 | Both | Smoke test 1: 64 PASS, the mailer refused by SES (`AccessDeniedException`) |
| 10 | Claude | Guesses why; proposes a cheap test with SES's mailbox simulator |
| 11 | Enrico | Runs it with a test User: `sent`. The guess is proven |
| 12 | Enrico | Decides the one exception to the no-wildcard rule, until part B |
| 13 | Both | Deploy 2 (the mailer's `identity/*`), smoke test 2: the mail sent, the line failed |
| 14 | Claude | Finds a bug in the smoke test; Enrico: "the Excel does not open" |
| 15 | Claude | Reads the file's bytes: a binary sent as text; fixes the encoding |
| 16 | Both | Deploy 3, smoke test 3: **65 PASS**, the Excel opens |
| 17 | Enrico | The look with real mails: invitation, throw-away User, `miri`'s mail, all yes |
| 18 | Claude | The logs, the alarms, the documents of part A |
| 19 | Enrico | The daily mail at the next whole hour, its two files correct |

## 1. Cutting step m10 in two

Step m10 waited for AWS to lift the sandbox, which can take days. The brief asked to split it:
part A deploys `on` now, with every recipient an address verified in SES; part B, once AWS
answers, invites the people again and closes the documents. Claude answered the brief's three
questions from AWS's documentation (`docs/EMAIL_ARCHITECTURE.md` section 22.2): in the sandbox
mail reaches only verified addresses and the simulator, Cognito's invitations included; what
`AdminCreateUser` does for an address that is not verified is not said, so a rule covers it (no
such User until part B); an address is verified in the console and can be deleted on its own.

Enrico asked whether the documents said *why* the split was made. Only the plan did; the
architecture and the runbook gained the sentence. Then he asked why the verified addresses
should be deleted at the end. Claude's honest answer was that its reason (personal data) was
weak for one's own addresses in one's own account; the deletion became the operator's choice.

## 2. Part A starts

The read-only start found the domain verified and something the documents did not know: four
address identities were already verified. Enrico confirmed they were the right ones, including a
`+admin` address for the Administrator; Claude explained that a `+label` is, for a recipient,
its own identity, and must match "My details" exactly. Enrico chose `miri` for the mail and kept
`enri` away from it. A question about the local stack and one about the gate (it refuses an
untracked file) led to committing the brief with `MailStage=on`, and pushing.

The first change set was read field by field before `y`: 32 changes, 6 Add, the pool Modify
with every detail `Never`, the other Modifies only because they name the pool's ARN.

## 3. The mailer refused, and a cheap test

The first smoke test passed 64 checks and failed one: the mailer's mail on demand. Both
invitations had arrived, so SES and the domain worked; the mailer's log said only
`AccessDeniedException`, by design. Claude's guess: in the sandbox SES checks the sender's role
against the recipient too when the recipient is a verified identity, and the mailer's role names
the domain alone. AWS's IAM page hints at it without saying it.

Rather than act on a guess, Claude proposed a test Enrico could run in five minutes: a test User
whose address is SES's simulator, which is no identity of the account, asking a mail. Enrico
asked for it in simple words, then ran it: `sent`. Asked whether his plain address would fare
better, Claude said no: every real address in the sandbox must be verified, and every verified
one is refused.

## 4. A decision against a rule, made carefully

Claude recommended waiting for production access and explained what "widening the role" would
mean, with four ways and their costs. Enrico chose the wildcard, `identity/*`, against the root
`CLAUDE.md`'s rule, but only until part B. Claude added a safeguard (the condition
`ses:FromAddress`, so that the role still sends only as `noreply@<domain>`), wrote the exception
into the rule itself within its 200-line limit, into the architecture and the runbook, and, at
Enrico's request, made part B's check mechanical: a `grep` that must find no `identity/*` left,
and the deployed role read back.

## 5. Two more findings, one by Enrico's eyes

The second smoke test failed again, but the mail had been sent: the script read the AWS CLI's
answer, printed once per page, as two lines where it waited for one number. Claude reproduced it
and fixed it with a sum. Then Enrico said the Excel file would not open. Saved in his Downloads,
its first bytes told the story: `ef bf bd`, the replacement character, over and over, a binary
file sent as 7-bit text. SES's reference lists the encodings without saying the default; the
code gave none. One field, `ContentTransferEncoding: 'BASE64'`, with its test. The local fake
mail could never have caught it; only a real mailbox could.

The third deploy changed the mailer's code alone. The third smoke test: 65 PASS, and the file,
3161 bytes as made, opened.

## 6. The look, and where it stands

Enrico looked at the real mails: the invitation from `noreply@`, not in spam, replies to the
alarm address; a throw-away User through invitation, resend, first sign-in and deletion; `miri`'s
mail on demand with its file. Claude read the logs (no error but the three known refusals, no
5xx) and the alarms (all OK, the 5xx alarm silent at `on`), and wrote the documents of part A:
`docs/RUNBOOK.md` sections 3.3 and 5.11, `README.md` "Versions" `v3.0.0`, the plan's v16 and its
"As done" note.

Then the daily mail: its hour set to the next whole hour, the timer's run `sent`, the mail in the
mailbox with its two files, both correct. Left: the commit of the documents, the tag `v3.0.0` on
Enrico's word, and `simtest` deleted. Part B waits for AWS.

## What made it work

- **A guess proven before it was acted on.** The simulator test turned "likely" into "known" for
  the price of one mail.
- **The operator's eyes where tests cannot reach.** A green smoke test would have released a
  broken Excel file; Enrico opening it found what no local test could.
- **Rules bent in the open.** The wildcard was decided by the Product Owner, written into the
  rule it breaks, narrowed by a condition, and given a mechanical check for its removal.
- **Questions that cost nothing and changed things.** "Why should I delete them?" removed a weak
  step; "explain in simple words" made a test runnable; "make sure it is removed" made part B
  checkable.
- **Nothing private in the open.** No address, password or account id in a command, a log, a
  document or a message, even while debugging SES and reading a mailed file.
