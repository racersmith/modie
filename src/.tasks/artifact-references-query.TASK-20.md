---
depends_on: []

links:
  - ADR-4
  - ADR-5
  - RULE-13
  - RULE-14
  - RULE-15
  - RULE-25
  - RULE-27
  - RULE-31
---

# Context

Provide automated discovery and classification of artifact references across the repository, capturing both "found in" (citations across governance artifacts, source code, and tests) and "links to" (declared outbound links and dependencies) to power guarded archival checks and codebase refactoring.

# Acceptance Criteria

- [ ] Implement core reference resolution service computing "found in" (governance, code, test, prose) and "links to" (links, dependencies) for any artifact tag
- [ ] Evaluate subtype-agnostic archival guard status (canArchive, blockingReasons) based on active governance citations
- [ ] Implement CLI command modie references <tag> (alias: refs) supporting formatted terminal output and machine-parsable JSON (RULE-27)
- [ ] Wire references command into CLI router and global help output
- [ ] Add unit and integration tests verifying reference discovery, classification, and archival guard evaluation across ADR, RULE, and TASK targets
