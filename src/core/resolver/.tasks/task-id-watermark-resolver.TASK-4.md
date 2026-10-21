---
depends_on:
  - TASK-2
  - TASK-3

links:
  - ADR-1
  - ADR-6
  - RULE-1
  - RULE-21
---

# Context

To fulfill ADR-6 and TASK-1's acceptance criteria, task IDs must increment monotonically across active files on disk, across deleted/completed tasks preserved in Git commit history, and across concurrent git branches without collisions.

This resolver inspects the working tree and queries git commit history (`git log --diff-filter=D`) to recover the current watermark and compute the next unique task ID according to the branch-aware strategy defined in TASK-2.

# Acceptance Criteria

- [x] Active task scanner detects existing `*.TASK-*.md` files in the repository and extracts their IDs.
- [x] Git history inspector identifies IDs of completed/deleted task files via git log diff queries.
- [x] Watermark calculation reliably produces the next monotonic integer even when all active tasks on disk have been deleted.
- [x] Branch-aware allocation allocates collision-free IDs for concurrent git branches according to the TASK-2 specification.
- [x] Add unit tests covering fresh repos, existing disk tasks, deleted git tasks, and multi-branch watermark scenarios.
