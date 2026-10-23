---
depends_on: []

links:
  - RULE-15
  - RULE-22
  - RULE-23
  - ADR-6
  - ADR-7
---

# Context

Front-load planned RULEs and ADRs into task definition by adding an optional Planned Governance section to the task template and CLI creation flags. Validate that planned governance artifacts exist before task completion. Inject agent best practices, anti-pattern warnings (e.g. avoiding ephemeral TASK tags in test assertions), and workflow instructions directly into MCP tool descriptions and instructions.md.

# Acceptance Criteria

- [ ] Add optional Planned Governance section to task template and task create flags
- [ ] Enforce planned governance artifacts are generated before task completion
- [ ] Inject agent best-practice instructions into MCP tool descriptions and server documentation
- [ ] Add unit and integration tests verifying planned governance validation and MCP guidance
