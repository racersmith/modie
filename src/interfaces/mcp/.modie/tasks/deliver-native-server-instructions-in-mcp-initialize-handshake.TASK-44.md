---
depends_on:
  - TASK-47

links:
  - RULE-6
  - RULE-21
  - RULE-25
  - RULE-26
  - RULE-30
---

# Context

Deliver agent governance instructions during the MCP protocol initialize handshake response in `McpServerOptions.instructions` rather than relying exclusively on static resource reads, ensuring connecting AI agents immediately receive architectural conventions in their system context.

# Acceptance Criteria

- [ ] Load agent governance instructions from repository configuration or default fallback content during server initialization
- [ ] Expose instructions string on `McpServerOptions` so it is transmitted in the initialize protocol handshake response
- [ ] Formulate instructions to emphasize ephemeral task decoupling (RULE-21), blast radius confinement (RULE-6), contract-based criteria (RULE-30), and consolidated tool workflows
- [ ] Verify client receives populated instructions in initialize response without requiring explicit resource reads
- [ ] Maintain `modie://instructions` read-only resource for standalone resource browsing
- [ ] User Review
