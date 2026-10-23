---
depends_on: []

links:
  - RULE-23
  - RULE-25
  - RULE-27
  - RULE-30
  - ADR-7
---

# Context

Define and enforce a new repository governance RULE establishing fixture-based test isolation: test assertions must never depend on the mutable state of the host repository. Refactor existing CLI and core tests (such as references.test.ts and task-query.test.ts) to execute against isolated temporary fixtures.

# Planned Governance

## Rules
- [x] Fixture-Based Test Isolation

# Acceptance Criteria

- [x] Create RULE for fixture-based test isolation forbidding assertions against mutable host repository artifacts
- [x] Refactor references.test.ts to run against isolated fixture directories
- [x] Refactor task-query.test.ts to run against isolated fixture directories
- [x] Verify all tests pass independently of host repository active tasks or rules
