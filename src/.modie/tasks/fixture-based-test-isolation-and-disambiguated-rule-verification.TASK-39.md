---
depends_on: []

links:
  - RULE-23
  - RULE-25
  - RULE-27
  - RULE-34
  - ADR-7
---

# Context

Replace brittle host repository file assertions with isolated temporary fixture workspaces (enforcing RULE-34). Disambiguate formal rule verification tags from test fixture data/string occurrences in the reference discovery engine per ADR-7 and RULE-23, preventing dogfooding pollution.

# Acceptance Criteria

- [ ] Provide a standardized test fixture workspace helper in the test utilities that initializes isolated temp directories, provides fixture artifact generation with test-scoped IDs, and executes CLI commands in-process and via subprocess with fixture working directories
- [ ] Refactor CLI find and show integration tests to execute against isolated fixture workspaces without depending on host repository files or hardcoded paths per RULE-34
- [ ] Refactor task creation and CLI root integration tests to execute against isolated fixture workspaces preventing mutations to the host repository tree
- [ ] Enhance the artifact reference discovery engine to distinguish between formal verification annotations / headers (ADR-7, RULE-23) and raw string occurrences in test files, eliminating false positive citations for rules referenced as test data
- [ ] Adopt test-scoped artifact tag conventions (e.g. RULE-TEST-*, ADR-TEST-*) across test fixtures to avoid collisions with active governance rules during full workspace citation scans
- [ ] Verify all unit and integration test suites pass and that references query on active governance rules returns zero false-positive test citations
