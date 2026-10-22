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

Provide automated detection of incoming artifact links across the repository to support safe deprecation, refactoring, and rule verification.

# Acceptance Criteria

- [ ] Implement core artifact impact resolution service computing incoming link references for any artifact tag
- [ ] Implement CLI command modie impact <tag> supporting human status output and machine-parsable JSON
- [ ] Wire impact command into CLI router and global help output
- [ ] Add unit and integration tests verifying impact analysis across ADR, RULE, and TASK link targets
