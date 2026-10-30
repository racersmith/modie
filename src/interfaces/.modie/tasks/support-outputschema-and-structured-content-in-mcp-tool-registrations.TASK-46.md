---
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Support outputSchema contracts on command definitions and project them into MCP tool registrations, returning structured output payloads alongside backwards-compatible text content per spec [2026-07-28 best practices](https://modelcontextprotocol.info/docs/best-practices/). Additionally, introduce declarative protocol payload sanitization hooks on `CliCommandDefinition` to eliminate hardcoded command-specific checks (e.g. `commandId === "read"`) in the MCP server's token economy sanitizer.

# Acceptance Criteria

- [ ] Extend command definition schema to support optional outputSchema contracts and declarative protocol sanitization hooks
- [ ] Pass outputSchema to MCP tool registration for tools with well-defined structured returns
- [ ] Format tool execution returns to deliver structured content matching declared output schemas alongside text block fallbacks
- [ ] Migrate hardcoded payload sanitizers in McpServer to consume declarative command definition hooks (RULE-26)
- [ ] Verify tools/list exposes outputSchema and tool call responses conform to declared output schemas in test suite
- [ ] User Review
