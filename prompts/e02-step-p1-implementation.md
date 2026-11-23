## Before opening the new session (operator)

Nothing to start. This step changes documents only: it needs no Docker, no local stack, no
AWS login and no Anthropic key. `nvm use` is enough.

## Brief

Implement plan step p1, "The decisions and the architecture" (`docs/CHANGE_PASSWORD_PLAN.md`),
following CLAUDE.md's working rhythm: one step, its acceptance check, an honest report, then
stop for review.

After this step `docs/ARCHITECTURE.md` says how a person changes their own password, before
any code exists: the browser calls Cognito's `ChangePassword` with the person's access token,
the current password and the new one, then signs the person out everywhere. No file of code
changes in this step, and nothing is deployed. The service is step p2 and is not started here.

Read these in full first:
- `CLAUDE.md`, in particular "Working rhythm" (**the closing message is short**), "Hard rules
  from the design", "Cloud safety" and "Changing these files".
- `docs/CHANGE_PASSWORD_PLAN.md`, all of it: the four decisions (section 2), the five findings
  (section 3), step p1, and steps p2 to p4 to see what this step must not take from them.
- `docs/ARCHITECTURE.md`: the change log and the status line; section 1.1 (requirement F4)
  and 1.2 (the decision row "Password change / reset"); section 2 and 2.1 (the pieces, the
  row of the user pool); section 3.1 (the tokens); section 5.1 (the pool, its password
  policy); sections 6.1 to 6.4 (the bootstrap, the sign-in, creating and deleting a User: the
  diagrams this step's new one sits beside); **section 7 in full**; section 8, the table of
  emulators and the two notes on Cognito's emulation; section 14.
- `.claude/rules/diagrams.md`: the rule every Mermaid diagram follows, and how to check one.
- `backend/template.yaml`: the user pool and its app client (the password policy, the flows
  allowed, the token lifetimes, `EnableTokenRevocation`). **Read only: it does not change.**
- `frontend/src/services/cognito.ts` and `login.service.ts`: how the browser already calls
  Cognito, and how the emulator's `InvalidPasswordException` is read today. Read only.

## Where we are (2026-11-22)

- The plan is written and its four questions are decided. Nothing is built.
- `docs/ARCHITECTURE.md` says a password change is deferred (requirement F4, the decision row
  of section 1.2, the residual risk of section 7.3) and gives the way to add it in section
  7.4, option B. This step turns "deferred" into "designed, not built yet".
- `CLAUDE.md` has 199 lines of the 200 it may have.

## Decided already (the Product Owner, 2026-11-22)

Apply them; if a document or AWS's reference proves one wrong, stop and tell me before going
on.

1. **Both roles.** A User and the Administrator each change their own password in the page.
   Nobody changes another person's: the Administrator cannot change a User's, and no route
   of the API changes a password.
2. **Sign out everywhere after a change.** The browser then calls Cognito's `GlobalSignOut`,
   which revokes every refresh token of the person, and clears its session: the person signs
   in again with the new password.
3. **A screen of its own**, "Password", last in the navigation. It is named here only so
   that the architecture's sentences agree with it: the screen is step p3.
4. **The assistant is not touched.** Nothing of `docs/CONVERSATIONAL_ARCHITECTURE.md` or
   `docs/CONVERSATIONAL_PLAN.md` changes in this plan.

## The step

1. **Confirm the plan's findings F1 and F2 against AWS's own reference** (the API reference
   of Amazon Cognito user pools, read through the documentation tools of the session), and
   report what you read, with the page:
   - `ChangePassword`: what it asks for; whether the access token of a `USER_PASSWORD_AUTH`
     sign-in is enough; which error answers a wrong current password, which a new password
     that breaks the policy, which too many attempts, which a dead or revoked token; whether
     it revokes any token.
   - `GlobalSignOut`: what it asks for, what it revokes, and what happens to an access token
     already issued (the authorizer verifies the token itself and asks Cognito nothing).
   - The exact list of the characters Cognito counts as a symbol in a password policy.

   What the emulator does was read in the code of cognito-local 5.3.0 and is in the plan: do
   not test it here. **If the reference contradicts the plan, stop and tell me**, with the
   correction to the plan proposed.
2. **`docs/ARCHITECTURE.md`**, a new version with its change log line and the status line:
   - Section 1.1, requirement F4, and section 1.2, the row "Password change / reset": a
     person changes their own password; a lost password is still not recovered.
   - Section 2.1, the row of the user pool, where it says what is ready for later.
   - **A new diagram in section 6**, after the last one, so that no section is renumbered:
     "Change one's own password". The browser, Cognito, no Lambda and no API: the change,
     the sign-out everywhere, the sign-in again. Under it, in words: why it can only be
     one's own password, what the page checks before the request, what is skipped locally.
   - Section 6.1: the sentence that the bootstrap script is the only way to set the
     Administrator's password (finding F3). What holds: the API never sets an
     administrator's password; the Administrator may change their own at Cognito, knowing
     the current one; the script is the way back from a lost one.
   - Section 7.1: the rows "Account hygiene" and "Privilege boundary". Section 7.2: the row
     on the takeover of the admin account, and a new row for what a stolen access token can
     and cannot do to a password. Section 7.3: the residual risk "No password change or
     reset" reworded (a known password can be changed, a lost one cannot), and the 15
     minutes an access token lives after a sign-out everywhere.
   - Section 7.4: option B marked as the one taken, with a pointer to the new diagram;
     options A and C stay as they are, not built.
   - Section 8: the emulation notes gain what differs for `ChangePassword` (finding F1) and
     that `GlobalSignOut` is missing from the emulator (finding F2).
   - Everything is written as **designed and not built yet**, with the plan named as where
     it is built, the way the document already speaks of the assistant's unbuilt parts.
3. **`CLAUDE.md`, "Hard rules from the design"**: one line, that a password is changed only
   by its owner, at Cognito, and that the API has no route that changes one. The file must
   stay under 200 lines: make room in the same change as "Changing these files" asks, and
   say in the report what moved where. Report the line count.
4. **`docs/CHANGE_PASSWORD_PLAN.md`**: an "As done" note under step p1, which ends with what
   step p2 finds ready; the plan's version line; a finding corrected where the reference
   proved it inexact.

Not in this step: any file under `backend/`, `frontend/` or `shared/`; `README.md`,
`docs/RUNBOOK.md`, `docs/FRONTEND_SERVICES.md`, `docs/FRONTEND_ARCHITECTURE.md` and
`docs/COMMANDS.md`, which change with the steps that build what they describe; the
assistant's documents; any `aws` command; the cloud.

## How we work in this step

- **Messages to me are short.** At the end of a task and at each pause: one or two simple
  sentences on what was done, then plainly what I must decide or do.
- **The pauses:** AWS's reference contradicts a finding or a decision; a sentence of the
  architecture cannot be made true without a change to the code or the template; two
  documents disagree (the architecture wins over the plan, the plan over this brief).
- Write as the document is written: plain words, each reference with the document's path in
  the same sentence, no step or brief number inside a sentence that describes the design.
- The new diagram follows `.claude/rules/diagrams.md` and is checked as that file says, by
  rendering it on a dark page and looking at the picture. The pictures go to the session's
  scratch folder, never into the repository.
- Explain in plain terms: the reader is not an expert of Cognito.
- Commit only when asked. Do not push. Do not start step p2.

## Acceptance (`docs/CHANGE_PASSWORD_PLAN.md` step p1)

- What AWS's reference says of the two calls and of the symbols is reported, and the plan's
  findings agree with it or are corrected.
- `docs/ARCHITECTURE.md` describes the change of one's own password in the sections listed,
  says nowhere that a password cannot be changed, and no sentence of it says the bootstrap
  script is the only way to change the Administrator's password.
- The new diagram renders readable on a dark page.
- `CLAUDE.md` holds the new line and is under 200 lines.
- `npm run lint` green at the root (the references in the comments and the documents).
- `git status` shows changes under `docs/` and in `CLAUDE.md` only.
- The "As done" note holds the detail. Then the short closing message, and suggest the commit.
