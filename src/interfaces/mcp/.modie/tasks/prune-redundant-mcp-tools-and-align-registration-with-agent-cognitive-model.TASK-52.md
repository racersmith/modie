---
depends_on:
  - TASK-50
  - TASK-51

links:
  - RULE-25
  - RULE-26
---

# Context

Align the MCP tool registration registry with agent cognitive friendliness by pruning redundant tool aliases (rule_archive, adr_archive in favor of unified archive), omitting editor-oriented find from the MCP toolset in favor of structured read and scope, and updating tool descriptions and agent guidance to reference read and scope.

# Acceptance Criteria

- [ ] Exclude CLI-only commands like find from MCP tool registration, reserving find exclusively for human CLI editor workflows
- [ ] Prune redundant subtype-specific archive aliases (rule_archive, adr_archive) from MCP registration in favor of unified archive tool
- [ ] Register read and scope as primary MCP inspection tools with rich agent guidance and token-efficient schemas
- [ ] Verify client tool listing exhibits no duplicate or conflicting tools and test suite validates clean registration
