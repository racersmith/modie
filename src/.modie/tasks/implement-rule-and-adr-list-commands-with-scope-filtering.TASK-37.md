---
depends_on: []

links:
  - RULE-9
  - RULE-25
  - RULE-26
  - RULE-27
  - RULE-30
  - ADR-4
---

# Context

Provide discovery commands modie rule list and modie adr list (and matching MCP tools) to inspect active rules and decisions, including titles, tags, and links, with optional ancestral scope filtering.

# Acceptance Criteria

- [ ] Implement query service in the core domain for listing active RULE and ADR artifacts with titles, tags, relative paths, and links
- [ ] Implement --scope filtering in the core listing query honoring ancestral scope traversal up to the workspace root
- [ ] Add rule list subcommand to the CLI interface with formatted table and machine-parsable JSON output enforcing stream separation
- [ ] Add adr list subcommand to the CLI interface with formatted table and machine-parsable JSON output enforcing stream separation
- [ ] Expose rule_list and adr_list tools in the MCP interface adhering to token economy and error conventions
- [ ] Add unit and integration tests verifying listing output, link presentation, stream separation, and ancestral scope filtering
