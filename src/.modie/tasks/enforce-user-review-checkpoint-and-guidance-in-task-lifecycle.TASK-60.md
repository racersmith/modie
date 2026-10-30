---
depends_on: []

links:
  - RULE-22
  - RULE-25
  - RULE-27
  - ADR-6
---

# Context

Establish a default human-in-the-loop review gate for tasks by automatically appending a 'User Review' acceptance criterion unless --no-review is passed, and update task command agentGuidance (complete, merge, check, create) to require user sign-off before completion and merging.

# Acceptance Criteria

- [x] Add review option (defaulting to true) to core createTask and expose --no-review / --review flag in CLI and MCP task_create
- [x] Automatically append 'User Review' acceptance criterion when review is enabled
- [x] Update agentGuidance across task complete, merge, check, and create commands to mandate human review checkpoints
- [x] Add comprehensive unit and integration tests verifying default User Review criterion, --no-review opt-out, and updated tool guidance
- [x] User Review
