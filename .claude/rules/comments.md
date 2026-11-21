---
paths:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.sh"
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.toml"
---

# Comments

The whole of the comment rule that the root `CLAUDE.md` ("Comments") states in short.

Applies to every comment in every file: TypeScript, JavaScript, shell, `template.yaml`, the
config files.

- A comment says in plain words what the code does or why, so that it can be read without
  opening a document. A reference to the documentation backs up the comment, it does not
  replace it.
- A reference names the document by its path, in the same sentence as the item it points at,
  every time: `docs/FRONTEND_SERVICES.md section 10.2`, `docs/FRONTEND_SERVICES.md section 8,
  decision 30`, `docs/FRONTEND_SERVICES.md section 2, rule 9`, `docs/SHARED_CALENDAR_SPEC.md
  R-BOOK-02`, `docs/SHARED_CALENDAR_SPEC.md decision D7`, `docs/SHARED_CALENDAR_SPEC.md AC-36`,
  `docs/SHARED_CALENDAR_SPEC.md section 11.1, route 16`, `docs/IMPLEMENTATION_PLAN.md step 9`.
  The labelled items count too: requirements `F…` and `N…` (`docs/ARCHITECTURE.md N6`),
  assumptions `A…` and open points `O…` (`docs/SHARED_CALENDAR_SPEC.md section 22, assumption
  A5`), approved changes `P…` (`docs/IMPLEMENTATION_PLAN.md`), decisions `D…` and `T…`.
- Never a nickname ("spec 8.4", "architecture 5.3", "plan step 9") or a bare item ("section
  9.4", "(13.2)", "decision 30", "R-BOOK-02"). The reference must exist in that document and
  say what the comment claims.
- No history in comments: no version tags ("v6", "spec v14"), no "brief 54", no "since step
  51", no "revised", "formerly", "now". A comment describes the code as it is; when it changed
  is in git and in the documents' change logs.
- Test names (`describe`, `it`, `test`) are exempt from the path rule: they keep their short
  references (`'checkChange (8.4, R-CHG-01)'`, `'AC-22: …'`). Instead, each outermost
  `describe` whose names hold one gets a one-line comment above it naming the document(s), not
  the items: `// Test names: section numbers, R-… rules and AC-… scenarios are those of
  // docs/SHARED_CALENDAR_SPEC.md (scenarios in its section 18.3).` History tags are refused in
  test names too.
- Enforced by `npm run lint`: the ESLint rule `local/doc-references`
  (`scripts/eslint-doc-references.mjs`) on TypeScript and JavaScript, and
  `scripts/check-doc-references.mjs` on the `#` comments of shell, YAML and TOML files; both
  use `scripts/doc-references.mjs`, which also knows the lower-case journey pages under
  `docs/journeys/`. The check finds references it cannot follow, an unknown document and
  history tags; whether a comment is clear stays a matter for review.
