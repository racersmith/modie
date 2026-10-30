---
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Register distinct, scoped MCP Resource Templates (modie://rules/{tag}, modie://adrs/{tag}, modie://tasks/{id}) with typed MIME types and clear descriptions per spec [2026-07-28 best practices](https://modelcontextprotocol.info/docs/best-practices/), omitting ambiguous generic tag URIs to enforce RULE-26 token economy.

# Acceptance Criteria

- [ ] Register dynamic resource template modie://rules/{tag} delivering architectural rule markdown with text/markdown MIME type
- [ ] Register dynamic resource template modie://adrs/{tag} delivering architectural decision record markdown with text/markdown MIME type
- [ ] Register dynamic resource template modie://tasks/{id} delivering task details and acceptance criteria with application/json MIME type
- [ ] Return descriptive errors when requested artifact identifiers or tags do not exist on disk
- [ ] Verify client resource template discovery and parameterized reading for rules, ADRs, and tasks in test suite
- [ ] User Review
