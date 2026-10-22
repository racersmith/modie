---
depends_on:
  - TASK-27

links:
  - RULE-25
  - RULE-26
  - RULE-27
  - RULE-30
---

# Context

Expose Modie's governance and task orchestration capabilities directly to AI coding agents via standard protocol interfaces. Automatically project shared Zod action definitions into typed MCP tools, provide read-only MCP resources for live workspace context, and strictly enforce RULE-26 token economy.

# Acceptance Criteria

- [x] Implement an MCP server module using @modelcontextprotocol/sdk supporting standard I/O transport
- [x] Implement an automated tool registry that exposes shared Zod action definitions as typed MCP tools
- [x] Ensure all MCP tool responses return strictly actionable schema payloads conforming to RULE-26 token economy
- [x] Expose read-only MCP resources for active ready tasks and workspace governance rules
- [x] Add a CLI entrypoint subcommand to launch the MCP server over standard I/O and verify tool execution via integration tests
