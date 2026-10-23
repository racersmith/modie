---
depends_on: []

links:
  - RULE-23
  - ADR-7
---

# Context

Define and enforce a new repository governance RULE establishing fixture-based test isolation: test assertions must never depend on the mutable state of the host repository. Refactor existing CLI and core tests (such as references.test.ts and task-query.test.ts) to execute against isolated temporary fixtures.

# Acceptance Criteria

- [ ] Create RULE for fixture-based test isolation forbidding assertions against mutable host repository artifacts
- [ ] Refactor references.test.ts to run against isolated fixture directories
- [ ] Refactor task-query.test.ts to run against isolated fixture directories
- [ ] Verify all tests pass independently of host repository active tasks or rules
