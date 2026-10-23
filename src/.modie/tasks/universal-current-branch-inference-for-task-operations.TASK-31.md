---
depends_on: []

links:
  - RULE-21
  - RULE-22
  - RULE-28
  - ADR-6
  - ADR-9
---

# Context

Allow modie task complete, modie task merge, and modie task check to automatically resolve the target task from the active git branch (task/<id>-<slug>) when the <id> argument is omitted, eliminating CLI friction while operating on task branches.

# Acceptance Criteria

- [ ] Support omitting task ID in task complete when on a task branch
- [ ] Support omitting task ID in task merge when on a task branch
- [ ] Support omitting task ID in task check when on a task branch
- [ ] Add unit and integration tests verifying current branch inference across all three subcommands
