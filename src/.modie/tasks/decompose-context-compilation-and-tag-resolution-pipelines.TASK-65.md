---
depends_on:
  - TASK-64

links:
  - RULE-2
  - RULE-6
  - RULE-8
  - RULE-20
  - RULE-29
---

# Context

Decompose the high-complexity context compilation (CC 36) and artifact tag resolution (CC 34) pipelines in src/core/query/ per the maintainability review. Extract resolveContextTarget with an early-return chain to eliminate deep nesting and duplicated compilation logic. Decompose resolveArtifactByTag into a discrete strategy chain (byExistingPath, byWorkspaceScan, byHistory) and unify ADR summary extraction.

# Acceptance Criteria

- [ ] Extract resolveContextTarget with early-return candidate matching, reducing compileContext cyclomatic complexity to <= 10
- [ ] Decompose resolveArtifactByTag into a strategy chain (byExistingPath, byWorkspaceScan, byHistory), reducing complexity to <= 10
- [ ] Unify ADR summary extraction into a single reusable helper during artifact resolution
- [ ] Verify context compilation and artifact tag resolution contracts across all test suites
- [ ] User Review
