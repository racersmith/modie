---
links:
  - ADR-1
  - ADR-4
---

An ADR artifact must not be archived while active, non-archived artifacts (rules, tasks, or descendant ADRs) maintain links referencing its tag. Superseded ADRs must retain active, deprecating status until all dependent references are migrated to their successor.
