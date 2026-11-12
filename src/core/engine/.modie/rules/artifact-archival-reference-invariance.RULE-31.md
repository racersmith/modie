---
links:
  - ADR-1
  - ADR-4
---

An indexable governance artifact (`ADR`, `RULE`) must not be archived while active, non-archived artifacts (rules, tasks, or descendant artifacts) maintain links referencing its tag. Superseded artifacts must retain active, deprecating status until all dependent references are migrated to their successor.
