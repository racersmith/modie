---
depends_on: []

links:
  - ADR-6
  - RULE-25
  - RULE-27
---

# Context

Implement canon task check and canon task complete CLI commands per ADR-6, RULE-25, and RULE-27.

# Acceptance Criteria

- [ ] Implement task-check CLI handler
- [ ] Implement task-complete CLI handler
- [ ] Register subcommands in cli.ts router
- [ ] Add CLI tests verifying stdout and stderr separation per RULE-27
