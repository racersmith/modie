---
links:
  - ADR-7
---

A test assertion or implementation verifying a rule must reference the rule identifier via comment annotations (`@verifies RULE-XX`, `@satisfies RULE-XX`) or standardized test description headers (`[RULE-XX]`). The static linter must flag rules with zero matching verification tags as verification gaps.
