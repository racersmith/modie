---
depends_on: []

links:
  - ADR-6
  - RULE-21
  - RULE-22
---

# Context

completeTask currently stages and commits only the task artifact file (relFilepath), ignoring uncommitted code changes in the working tree and requiring a manual pre-commit step. Update completeTask and CLI task complete / finish to automatically detect working tree status: if uncommitted code changes exist, stage all and commit as Phase 1 (feat(TASK-<id>): <slug>); if the working tree is already clean, skip Phase 1 and proceed directly to Phase 2 (chore(task): delete completed TASK-<id> artifact).

# Acceptance Criteria

- [x] Update completeTask to inspect git status and stage all pending working tree changes for Phase 1
- [x] Automatically skip Phase 1 commit if working tree is already clean and criteria are satisfied
- [x] Execute Phase 2 artifact deletion and commit atomically without requiring manual pre-commit steps
- [x] Add unit and integration tests verifying clean and dirty working tree scenarios for two-phase completion
