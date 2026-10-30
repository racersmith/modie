---
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Declare tool annotations (readOnlyHint, destructiveHint, idempotentHint) on registered MCP tools per spec [2026-07-28 best practices](https://modelcontextprotocol.info/docs/best-practices/) so MCP clients and host security guards can differentiate safe read-only queries from mutating or destructive operations.

# Acceptance Criteria

- [ ] Extend interface command definitions to support optional tool annotation hints
- [ ] Annotate read-only query commands with readOnlyHint and idempotentHint hints
- [ ] Annotate mutating and deletion commands with destructiveHint hints
- [ ] Project declared annotations into MCP tool registration configuration so tools/list reflects annotation metadata
- [ ] Verify tool listing integration tests assert presence of expected annotations on query and mutation tools
