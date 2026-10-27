---
depends_on: []

links:
  - ADR-7
  - RULE-23
  - RULE-34
  - RULE-35
---

# Context

Refactor src/core/query/references.test.ts to use createFixtureWorkspace instead of raw node:fs/promises mkdtemp/rm. Eliminate all literal artifact tags (ADR-1, RULE-1, RULE-25, etc.) in test fixture seeds and isTestVerificationCitation unit tests by parameterizing with makeTestTag to satisfy RULE-34 and RULE-35.

# Acceptance Criteria

- [x] Refactor references.test.ts fixture lifecycle from raw mkdtemp/rm to createFixtureWorkspace
- [x] Modernize test fixture seed artifacts in references.test.ts to use workspace.createAdr, workspace.createRule, and workspace.createTask with makeTestTag
- [x] Parameterize isTestVerificationCitation unit tests in references.test.ts with makeTestTag to eliminate literal tag false positives
- [x] Verify all references tests and repository test suites pass with zero false-positive citations for RULE-1, RULE-25, and ADR-1
