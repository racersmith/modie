---
depends_on:
  - TASK-10

links:
  - ADR-6
  - ADR-9
  - ADR-10
  - RULE-18
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

Automate hierarchical branch creation and merging per RULE-28 and ADR-9 Section 6 via modie task start and modie task merge. Ensure subtask branches branch directly from their parent task branch and merge back into their parent branch without manual git topology errors. Introduce project configuration (.modie/config.json) to declare protected branches (e.g. main) and trunk, guarding against starting tasks from or merging into protected branches.

# Acceptance Criteria

- [x] Implement Modie project configuration loader (.modie/config.json and git config) with trunk and protectedBranches definitions
- [x] Implement core Git branching service to compute branch topology (detect root task vs subtask parent branch and protected status)
- [x] Implement modie task start <id> to create and check out the correct task branch (task/<id>-<slug>), guarding against starting from protected branches
- [x] Implement modie task merge <id> to verify completion and merge subtask branches back into their parent branch per RULE-28, guarding against merging into protected branches
- [x] Add CLI validation preventing subtask branches from merging directly into trunk dev or protected branches
- [x] Add unit and integration tests for task branch creation, protected branch guards, parent-child topology resolution, and merge verification
