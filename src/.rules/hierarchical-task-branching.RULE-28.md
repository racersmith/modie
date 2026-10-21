---
links:
  - ADR-6
  - ADR-9
  - RULE-6
  - RULE-21
---

A sub-task branch (`task/<parent_id>-<sequence>-<slug>`) must branch from and merge back into its parent task branch (`task/<parent_id>-<slug>`). Sub-task branches must never be merged directly into trunk (`main`, `dev`). The parent task branch may only be merged into trunk after all child sub-tasks have completed, verified their acceptance criteria, deleted their task artifacts per RULE-21, and merged into the parent branch.
