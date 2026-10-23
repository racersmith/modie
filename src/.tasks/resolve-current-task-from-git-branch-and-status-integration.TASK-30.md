---
depends_on: []

links:
  - ADR-1
  - ADR-6
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

Resolve active TASK artifact from current git branch topology (task/<id>-<slug>) and surface it in modie task list and modie task status. Default bare modie task status (and --current flag) to display current task details, and indicate current task in modie task list table. Provides foundational active task resolution primitive for upcoming task context compiler.

# Acceptance Criteria

- [x] Implement core resolveCurrentTask domain service in task module inferring active task from git branch topology
- [x] Update modie task status CLI command and MCP tool to resolve current task when invoked without arguments or with --current flag
- [x] Update renderTaskQueueTable and modie task list to indicate current task in STATUS column
- [x] Provide fallback to full task queue table when bare modie task status is run outside a task branch
- [x] Add unit and integration tests covering branch task resolution, CLI status invocation, and list table indicators
