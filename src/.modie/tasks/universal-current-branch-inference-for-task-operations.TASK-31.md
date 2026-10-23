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

Allow modie task complete, modie task merge, and modie task check to automatically resolve the target task from the active git branch (task/<id>-<slug>) when the <id> argument is omitted, eliminating CLI friction while operating on task branches. Additionally, provide a top-level backlog command and task backlog subcommand alias routing to active task listing.

# Acceptance Criteria

- [ ] Support omitting task ID in task complete when on a task branch
- [ ] Support omitting task ID in task merge when on a task branch
- [ ] Support omitting task ID in task check when on a task branch
- [ ] Support top-level backlog command and task backlog subcommand alias for active task listing
- [ ] Add unit and integration tests verifying current branch inference and backlog aliases
