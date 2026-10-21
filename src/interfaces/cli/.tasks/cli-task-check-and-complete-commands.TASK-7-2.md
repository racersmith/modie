---
depends_on:
  - TASK-7-1

links:
  - ADR-6
  - RULE-18
  - RULE-21
  - RULE-22
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

Implement canon task check and canon task complete CLI commands per ADR-6, RULE-25, and RULE-27.

# Acceptance Criteria

- [ ] Implement task-check CLI handler
- [ ] Implement task-complete CLI handler
- [ ] Register subcommands in cli.ts router
- [ ] Support repeated CLI flags for list options (--criteria and --links) without comma collision
- [ ] Add CLI tests verifying stdout and stderr separation per RULE-27
