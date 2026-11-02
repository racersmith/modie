---
depends_on: []

links:
  - RULE-1
  - RULE-28
---

# Context

Consolidate task-branch parsing/formatting into a canonical helper (RULE-28), extract shared path normalization and string idioms into core/common/, derive package version dynamically from package.json, and purge 46 dead handle* and print*Help exports and pass-through wrappers.

# Acceptance Criteria

- [ ] Consolidate task branch parsing, formatting, and globs into a single canonical module in src/core/common/task-branch.ts adhering to RULE-28
- [ ] Extract shared path normalization (toPosixRelative, escapeRegex) and string idioms (slugToTitle, taskKey) into src/core/common/ and replace duplicate inline definitions
- [ ] Derive CLI and MCP version dynamically from package.json to eliminate version drift
- [ ] Remove unused handle* and print*Help exports and unused namespace help wrappers across CLI command definitions
- [ ] Remove pass-through wrappers in git-inspector.ts and call underlying adapter/services directly
- [ ] Verify test suite passes with zero regressions
- [ ] User Review
