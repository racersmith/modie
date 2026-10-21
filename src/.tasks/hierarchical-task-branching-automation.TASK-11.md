---
depends_on:
  - TASK-10

links:
  - ADR-6
  - ADR-9
  - RULE-18
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

Automate hierarchical branch creation and merging per RULE-28 and ADR-9 Section 6 via modie task start and modie task merge. Ensure subtask branches branch directly from their parent task branch and merge back into their parent branch without manual git topology errors.

# Acceptance Criteria

- [ ] Implement core Git branching service to compute branch topology (detect root task vs subtask parent branch)
- [ ] Implement modie task start <id> to create and check out the correct task branch (task/<id>-<slug> from trunk or parent task branch)
- [ ] Implement modie task merge <id> to verify completion and merge subtask branches back into their parent branch per RULE-28
- [ ] Add CLI validation preventing subtask branches from merging directly into trunk dev
- [ ] Add unit and integration tests for task branch creation, parent-child topology resolution, and merge verification
