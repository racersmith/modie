---
summary: Replace arbitrary partial command re-exports in src/interfaces/cli/index.ts with canonical command index export.
depends_on:
  - TASK-85-3

links:
  - RULE-25
  - RULE-27
---

# Context

src/interfaces/cli/index.ts currently re-exports an arbitrary subset of command modules. This sub-task cleans up the exports to consistently expose commands and top-level CLI types.

# Acceptance Criteria

- [x] Arbitrary partial command exports in src/interfaces/cli/index.ts replaced with complete commands index export
- [x] Interfaces CLI public export contract verified
- [x] All checks pass via bun run verify
- [x] User Review
