---
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Deliver agent governance instructions during the MCP protocol initialize handshake response in McpServerOptions rather than relying exclusively on static resource reads, ensuring connecting AI agents immediately receive architectural conventions in their system context.

# Acceptance Criteria

- [ ] Load agent governance instructions from repository plugin configuration or default fallback content during server initialization
- [ ] Expose instructions string on the McpServerOptions configuration object so it is transmitted in the initialize protocol handshake response
- [ ] Verify client receives populated instructions in initialize response without requiring explicit resource reads
- [ ] Maintain modie://instructions read-only resource for backwards compatibility and standalone resource browsing
