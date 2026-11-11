---
summary: Expose a dedicated MCP tool to create and scaffold directory-level MOTIVE.md scope intent files.
depends_on: []

links:
  - RULE-25
  - RULE-26
---

# Context

Modie CLI supports `modie motive create`, but the MCP server does not expose an MCP tool for authoring MOTIVE.md files. Adding this tool allows agents to scaffold and set scope intent natively.

# Acceptance Criteria

- [x] Define schema and input validation for motive creation tool adhering to token economy
- [x] Implement MCP request handler delegating to core createMotive domain function
- [x] Register motive creation tool on MCP server with operational annotations
- [x] Add unit and integration tests verifying motive creation via MCP client transport
- [x] Pass `verify` tests.
- [x] User Review
