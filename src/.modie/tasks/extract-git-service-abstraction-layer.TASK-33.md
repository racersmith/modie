---
depends_on: []

links:
  - RULE-25
  - RULE-28
  - ADR-6
---

# Context

Decouple direct execFile git command execution from task and branching domain logic by introducing an IVcsAdapter interface and GitCliAdapter implementation, providing mockable testing and cleaner error boundaries.

# Acceptance Criteria

- [x] Define IVcsAdapter interface covering branch detection, tree inspection, commit, checkout, and merge
- [x] Implement GitCliAdapter and wire into task completion, branching, and watermark resolution
- [x] Support injecting mock VCS adapters into core functions for fast, hermetic unit tests
- [x] Update existing tests and verify zero regressions
