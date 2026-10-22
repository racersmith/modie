---
depends_on:
  - TASK-9

links:
  - ADR-6
  - RULE-21
  - RULE-22
  - RULE-25
  - RULE-27
---

# Context

Automate the two-phase Git commit ceremony for ephemeral task completion (committing verified acceptance criteria before deleting the artifact per RULE-21 and ADR-6) via modie task complete --commit. Prevent accidental resurrection of completed tasks by guarding against re-committing deleted task IDs.

# Acceptance Criteria

- [x] Implement core Git commit orchestration service for atomic two-phase completion (phase 1: verified criteria commit; phase 2: deletion commit)
- [x] Add --commit flag to modie task complete (or modie task finish alias) that executes both commit phases automatically with standard commit messages
- [x] Implement Git history guard preventing resurrection of previously deleted task IDs during task creation or validation
- [x] Add unit and integration tests verifying two-phase commit execution and zombie task resurrection prevention
