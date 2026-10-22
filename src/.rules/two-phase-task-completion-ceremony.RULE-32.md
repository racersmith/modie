---
links:
  - ADR-6
---

Task completion in a version control repository must follow an atomic two-phase commit ceremony: Phase 1 commits all uncommitted working tree changes alongside verified acceptance criteria (`feat(TASK-<id>): <slug>`), automatically skipping Phase 1 if the working tree is already clean; Phase 2 atomically deletes the task artifact from disk and commits its removal (`chore(task): delete completed TASK-<id> artifact`).
