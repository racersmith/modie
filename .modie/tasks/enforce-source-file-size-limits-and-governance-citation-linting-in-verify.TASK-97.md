---
summary: Upgrade oxlint source max-lines to an error, add a soft test file length warning, and add a fast governance citation lint check to scripts/verify.ts.

depends_on: []

links: []
---

# Context

With recent modularization clearing all `oxlint` `max-lines` warnings (0 warnings, 0 errors across the codebase), we can lock in maintainability and governance invariants mechanically in `bun run verify`:

1. **Enforce `max-lines` in `.oxlintrc.json`**:
   - Upgrade the default `max-lines` rule (`500`, `skipBlankLines: true`, `skipComments: true`) for production source files from `"warn"` to `"error"` so new oversized source modules cannot creep back in unnoticed.
   - Replace `"max-lines": "allow"` in the `**/*.test.ts` / `**/*.spec.ts` override with a soft warning threshold (e.g., `["warn", { "max": 650, "skipBlankLines": true, "skipComments": true }]`) so growing test monoliths surface early without breaking existing suites.

2. **Governance citation linting in `scripts/verify.ts`**:
   - Modie's universal governance invariant (also discussed in `.modie/ideas/architecture-linter-and-blast-radius-verification.IDEA.md`) prohibits citing ephemeral `TASK-XX` identifiers or `ADR-XX` decision records in code comments, docstrings, or unit test names—code and tests must cite exclusively falsifiable `RULE-XX` tags (`@verifies RULE-XX`, `[RULE-XX]`).
   - Add a fast verification script (e.g. `scripts/check-citations.ts`, wired into `CHECKS` in `scripts/verify.ts`) that scans `src/**/*.ts` (excluding `.modie/` markdown artifacts) for forbidden literal `TASK-<id>` and `ADR-<id>` citations in comments, docstrings, and `describe`/`it`/`test` titles, while avoiding false positives on legitimate runtime code (such as tag parsers, regex patterns, CLI help examples, or dynamic `formatArtifactTag(...)` helpers).
   - Report exact file path, line number, and offending snippet on failure, and clean up any pre-existing legacy violations uncovered in `src/` (for example stale `ADR-X` citations in old comments or test titles) so `bun run verify` passes cleanly out of the box.

Starting points:
- `.oxlintrc.json`
- `scripts/verify.ts`
- `.modie/ideas/architecture-linter-and-blast-radius-verification.IDEA.md`
- `src/core/engine/query/citation-classifier.ts` (for existing citation pattern conventions)

# Acceptance Criteria

- [ ] Linter configuration enforces the production source file length limit as a hard error and surfaces oversized test files via a soft warning threshold
- [ ] The repository verification runner includes a fast governance citation check that detects forbidden ephemeral task and decision-record citations in code comments, docstrings, and test titles
- [ ] Any pre-existing forbidden task or decision-record citations in repository source comments or test titles are resolved so the new verification check passes cleanly
- [ ] All repository verification checks pass including the new governance citation check with zero lint errors
- [ ] User Review
