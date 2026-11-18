---
links:
  - ADR-6
  - ADR-9
  - RULE-6
  - RULE-21
---

A sub-task branch (`task/<parent_id>-<sequence>-<slug>`) must branch from and merge back into its root parent task branch (`task/<parent_id>-<slug>`). Sub-task nesting is strictly capped at depth 1 (root task -> sub-task): sub-tasks must never spawn nested sub-subtasks, and creating tasks while checked out on a sub-task branch is prohibited. Sub-task branches must never be merged directly into trunk (`main`, `dev`), and no branch containing unmerged commits from another active task branch may merge into trunk. The parent task branch may only be merged into trunk after all child sub-tasks have completed, verified their acceptance criteria, deleted their task artifacts per RULE-21, and merged into the parent branch.
