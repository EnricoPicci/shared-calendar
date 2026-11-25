# The conversation behind the e-mail architecture

A summary of the session of 2026-11-25 in which the Product Owner (Enrico) and Claude Code
turned a one-paragraph idea, "what would it mean to send e-mail from the app?", into
`docs/EMAIL_ARCHITECTURE.md`, from the brief `prompts/mail-m01-integrate-mail-idea.md`. It keeps
what explains how we worked and what we decided, and leaves out the details, which live in the
document.

## How the session went, at a glance

| # | Who | What |
|---|---|---|
| 1 | Enrico | The brief: three use cases, from–to dates, "ask any question, start only when everything is clear" |
| 2 | Claude | Reads the architecture and finds that e-mail had been politely but firmly excluded, then asks four questions |
| 3 | Enrico | Declines the questions, to explain first: a forced password change, a GDPR page to come, three new facts about every person |
| 4 | Claude | Asks again with the new facts; two answers come back, two more clarifications follow |
| 5 | Enrico | The sender: Reply-To now, a real mailbox maybe later, a domain that may change |
| 6 | Enrico | The daily mail grows a second Excel file, a backup |
| 7 | Claude | Spots a hole in the backup's dates; the last questions are answered in one go |
| 8 | Claude | Checks the AWS facts with the AWS Knowledge tools, tries the local Cognito with a throw-away user, writes the document, renders its diagrams |
| 9 | Enrico | Settles the open points; asks what "DNS records" and "the sandbox" mean, in plain words |
| 10 | Enrico | Deletes the existing Users instead of patching them; asks what happens with a wrong address |

## 1. The brief, and the wall behind it

The brief was short and generous: send a new user their password, send the Administrator an
Excel file of the calendar every day (and on demand, from the week page or the assistant), send
each User their own appointments, all between two dates. And one rule for Claude: ask first,
build later.

Claude's first stop was `docs/ARCHITECTURE.md`, which turned out to have opinions. "No e-mail is
sent in v1." "Every password is set as permanent." "The Administrator keeps the generated user
passwords confidential and delivers them out of band." The user pool even carried an unused
`email` attribute, "kept so the forgot-password upgrade needs no pool change": a door left ajar
on purpose a month earlier. `docs/SHARED_CALENDAR_SPEC.md` section 15 went further: every
booking already writes an `EVENT` item "for the notifier that will come". The house had been
wired for e-mail; nobody had switched it on.

So the first honest thing to say was uncomfortable: **e-mailing a password goes against the
rules of the house**, and a password sitting in a mailbox stays readable forever. Enrico had
asked, in an earlier session, for real opinions rather than polite ones; this was one.

## 2. Four questions, three "wait, let me explain"

Claude asked four questions at once. Enrico declined the dialog, not to refuse but to talk:
the app now lets people change their password, so why not e-mail a generated one **and force
the change at the first sign-in**? And while we are changing what we collect: a GDPR consent
page is coming, so ask for first name, last name and a free-text postal address too.

That was better than any of the options Claude had offered. A forced change makes the mailed
password worthless once used, and expired if unused. Claude said so, added the one caveat that
mattered (a postal address needs a stated purpose under the GDPR) and asked again.

The rhythm repeated twice more, and each pause brought something the questions could not have
guessed:

- **The sender.** Enrico wanted mail from an address the Administrator can actually read, on a
  domain that might change one day. The answer landed as: `noreply@<domain>` with a Reply-To
  for now, and everything a parameter, so that a domain with real mailboxes later is a change
  of settings, not of code.
- **The daily mail.** Not one Excel file but two: the next 7 days, and a **backup** of every
  appointment from the previous month onwards, "in case something goes wrong, so the
  Administrator does not lose appointments".

Here Claude did its one bit of arithmetic of the day. "The mail of 26 November holds all of
October and all the future appointments" leaves out 1 to 25 November, exactly the days a backup
should not forget. Enrico chose "from the 1st of last month onwards", no gap. The last four
questions (the User's mail, a Confirm button for the assistant, only one's own address,
appointments only in the Excel) came back answered in a single round.

## 3. Checking the facts: the AWS Knowledge tools

Before drawing a single box, Claude checked what AWS really allows, with the **AWS Knowledge
tools** (the `aws-knowledge` server: AWS's documentation search, its page reader and its
regional catalogue). Four questions, four answers that shaped the design:

| Question | What the AWS documentation said | What it changed in the architecture |
|---|---|---|
| Can Cognito in Stockholm send through our own SES, and from which region? | `eu-north-1` is "**In-Region only**": the SES identity must live in Stockholm too | One SES identity, in the stack's own region; no detour through Ireland or Virginia |
| Can SES attach an Excel file without us building a raw MIME message? | Since April 2025 the simple `SendEmail` of SES v2 takes **attachments** | No MIME code to write and test; the mailer stays small |
| Are SES's identity, configuration set and EventBridge Scheduler offered in `eu-north-1` by CloudFormation? | All four resource types: **available** | Everything fits in the one `template.yaml`, unlike the budget, which CloudFormation cannot make there |
| What does Cognito need to send through our SES, and what blocks it at first? | A **service-linked role** Cognito creates when pointed at SES, and the **SES sandbox** until AWS lifts it | The deploy in three stages (`off`, `domain`, `on`), the operator's two tasks, and an open point on the deploying profile's permission |

The pricing page added the last fact: SES's new Essentials plan, 0.16 USD per thousand mails.
At about a hundred mails a month the whole feature costs a few US cents, comfortably under the
project's 1 USD budget. Without these checks the design would have rested on memory; with them,
each AWS claim in the document points at a page read that day (its section 22).

## 4. Asking the emulator, not guessing

The second fact-check happened on the laptop. Would the local Cognito emulator, `cognito-local`,
play along with invitations and forced changes, or would every journey need a workaround? Claude
created a throw-away user called `mailprobe` and walked it through the flow:

- the invitation: printed in the container's log, temporary password included (a modest 6
  characters, cheerfully ignoring the pool's 12-character policy);
- the first sign-in: `NEW_PASSWORD_REQUIRED`, no token, exactly like the real Cognito;
- the new password: tokens, and the account turned `CONFIRMED`;
- "resend the invitation": **`Unsupported`**.

Then `mailprobe` was deleted. Three yeses and one no, which became a decision: the resend is
proved in the cloud by the smoke test, as the global sign-out already is.

## 5. The document

`docs/EMAIL_ARCHITECTURE.md` came out in 22 sections, in the house style of plain words. In
short:

- **Cognito sends the invitation itself**, through our SES. The temporary password is never
  seen by our code, our logs or the Administrator, which ends up *safer* than today, when the
  creation answer carries the password.
- **One function sends everything else**, the mailer, started in the background by the routes,
  by the assistant's confirmed proposal, or by an hourly timer that sends the daily mail
  exactly once, at the hour the Administrator picks.
- **A small new table, `mail`**, for the settings, the "sent today" mark and the per-person
  counters, leaving the calendar's table and its lock untouched.
- **Two diagrams**, rendered on a dark page and looked at before being called done, as the
  project's diagram rule asks. One pair of labels touched and was shortened.
- **A new major version**, v3.0.0, because the creation answer loses its password field.

## 6. The review

Enrico's review was brisk. The postal address stays, **for future invoices**. The Reply-To is
**today's alarm address**. The seven choices Claude had made on its own were confirmed, v3.0.0
accepted, and the remaining five open points accepted as proposed.

Two questions came with it.

**"What do you mean, DNS records and the sandbox?"** Claude explained, in plain words. Anyone can
write any sender on an envelope, so mail providers check whether the domain's owner allowed
it: three lines added at the DNS provider are that permission. And AWS starts every new mail
account in a test mode that can only write to addresses you have confirmed yourself; one short
form, usually answered within a day, opens it.

**"What if the new user's e-mail address is wrong?"** There are three kinds of wrong. Not an
address: refused by the form. An address that does not exist: it bounces, the report reaches
the alarm address within minutes, the Administrator corrects it and resends. The tricky one is
**someone else's real address**: a stranger receives a working temporary password. No
verification code can help, since it would go to the same wrong address. So the form now shows
the address once more and asks for a Confirm before sending, and the users' list ("invited" or
"active") tells the Administrator whether someone has used the invitation.

And one decision that made a whole section shorter: rather than have the Administrator type the
facts of every existing User by hand, **delete the existing Users at the start** and invite
again whoever still needs an account.

## 7. Where it stands

- `docs/EMAIL_ARCHITECTURE.md`: written, every open point settled, lint green. Not committed.
- Nothing built, nothing deployed, no cloud command run. Locally, one throw-away user, created
  and deleted.
- Next: commit the document and its brief, then write `docs/EMAIL_PLAN.md` from its section 20.

## What made it work

- **"Start only when everything is clear" was taken literally.** Four rounds of questions felt
  slow at the time; each one changed the design, and the second Excel file, the forced change
  and the Reply-To would all have been wrong guesses.
- **Declining a question to explain was the most useful answer.** The best ideas of the session
  (the forced change, the backup) came from those pauses, not from the options offered.
- **Facts were looked up, not remembered.** The AWS Knowledge tools for the cloud, a throw-away
  user for the emulator. Every claim in the document has a source or a test behind it.
- **Opinions were given, even unwelcome ones**: e-mailing a password is risky, and an address
  without a purpose is hard to defend under the GDPR. Both made the design better.
