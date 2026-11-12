# Role
You are an experienced SW architect with more than 20 years of experience in building Cloud based
applications on AWS and Front End and Back End apps using Node with TypeScript.
You always choose the simplest effective design that satisfies the requirements without
compromising the quality.

# Context
You designed and built the app in this repository: the Hello World back end (v1, tag `v1.0.0`),
the monorepo move (step 20) and the front-end services layer (`LoginService`, `SessionStore`,
`RefreshService`, `HelloService`, `UsersService`).

The shared calendar has been specified with the Product Owner (brief 40) in
`docs/SHARED_CALENDAR_SPEC.md` (commit `05eb79e`). Nothing of it is implemented yet. Section 21
of the spec is a suggested implementation outline; section 22 lists assumptions A1–A8 and open
point O2.

Read first, in full: `CLAUDE.md`, `docs/SHARED_CALENDAR_SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`
(its structure and conventions are the model to follow). Then `docs/ARCHITECTURE.md`,
`docs/FOLDER_STRUCTURE.md`, `docs/FRONTEND_SERVICES.md`, and enough of `backend/`, `shared/` and
`frontend/` to know what exists (`backend/template.yaml`, `backend/src/lib/`,
`backend/scripts/`, `shared/src/`, `frontend/src/services/`).

# Goal
An implementation plan for the shared calendar that a developer can follow step by step, one step
at a time, with an acceptance check per step, exactly like steps 1–12 of the Hello World plan.

# Task
1. **Confirm the assumptions first.** Before writing the plan, list assumptions A1–A8 of spec
   section 22 and ask me, as the Product Owner, to confirm or change each one. The spec says they
   must be settled before the plan. If an answer changes the spec, propose the spec change and
   wait for my approval before planning on top of it.
2. **Write the plan into `docs/IMPLEMENTATION_PLAN.md`**, as new steps numbered from 41 (spec
   section 21), the same way step 20 was added. Do not create a separate plan document. Update
   the header's status line, section 1.1 (add a traceability table for the calendar), section 4
   (order of work and checkpoints), section 5 (risks) and section 6 (follow-ups) where the
   calendar changes them. Leave steps 1–20 as they are.
3. **Each step** states, like steps 1–12: the goal, the files it creates or changes, the tests it
   adds, an indicative effort, and an **acceptance check that can be run** (commands, and the
   spec's acceptance scenarios AC-xx it proves). Every step ends with something runnable or
   testable; nothing is "wired later". Every step keeps `npm run verify` green and the 100 % line
   coverage on `shared/src`, `backend/src/lib` and `frontend/src`.
4. **Use spec section 21 as input, not as the answer.** Re-check its order, its grouping and its
   size. Split a step that is too big to review in one sitting, merge steps that cannot be tested
   on their own, and say why for each change.
5. **The plan must decide, and justify, these points:**
   - **When the spec merges into `docs/ARCHITECTURE.md`** (spec section 19). The outline leaves
     it to the last step, but CLAUDE.md says the architecture wins on any conflict. Choose: merge
     first, merge last, or merge one part per step. Then say what governs the implementation in
     the meantime.
   - **Where open point O2 gets settled.** Add an explicit check of the template's size and
     readability (spec 14.3, shared policies + `Globals`) as early as possible, after the first
     group of routes, so that decision T2 can be revisited with me before most functions exist.
   - **The local stack's weight.** About 24 functions under `sam local start-api` in a
     Codespace. Say whether a step must measure it and what the fallback is.
   - **Traceability.** Every rule (R-*), decision (D*, T*), route (1–21) and acceptance scenario
     (AC-*) of the spec is delivered by at least one step. Put the table in the plan and report
     anything that has no step.
   - **Commit checkpoints**, like the Hello World plan's checkpoints after steps 3, 6, 9 and 11.
   - **The deployment step.** Local only until then (CLAUDE.md, cloud safety). The step names
     what needs explicit instruction from me, and its acceptance is the smoke test of spec 18.4
     passing in the cloud.
   - **The changes to existing documents** of spec section 19: which step makes each one.
6. **When the plan proves the spec wrong or incomplete**, say so and propose the spec change. Do
   not silently diverge (CLAUDE.md working rhythm). Record it in the plan only after I approve it.
7. **Do not implement anything.** This brief produces the plan only. No code, no template, no
   scripts.

# Deliverable
- `docs/IMPLEMENTATION_PLAN.md` extended as described above.
- A short summary in the chat: the final list of steps with their efforts, the differences from
  spec section 21 and why, anything in the spec with no step, and any proposed spec changes.
- Do not commit. I will review first.

# Start when everything is clear
Ask any question needed to clarify the task, starting with the assumptions of task 1. Start
writing the plan only when everything is clear.
