---
depends_on:
  - TASK-52

links:
  - RULE-6
  - RULE-16
  - RULE-19
  - RULE-25
  - RULE-26
---

# Context

Format tool validation and execution error messages to return structured self-recovery error envelopes (`isError: true`, machine-readable `code`, actionable `diagnostic`, and concrete `recovery` objects) per `scratch/mcp-design.md`, directing models to correct invalid arguments, resolve spatial ancestry violations, and discover valid artifacts through the 5 consolidated tools rather than falling into retry loops.

# Acceptance Criteria

- [ ] Standardize MCP tool execution error handler to construct structured `{ isError: true, code, message, diagnostic, recovery }` response payloads
- [ ] Implement standardized error codes including `CRITERIA_INCOMPLETE`, `ANCESTRY_VIOLATION_RULE_16`, `BLAST_RADIUS_BREACH_RULE_6`, `ARTIFACT_NOT_FOUND`, and `INVALID_PARAMETER`
- [ ] Provide actionable recovery objects suggesting discovery via `modie_query_catalog`, `modie_compile_context`, and `modie_task_lifecycle` rather than deprecated CLI tools
- [ ] Verify model-recoverable error envelopes across invalid arguments, boundary breaches, and missing artifact scenarios in test suite
- [ ] User Review
