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

Per the maintainability review (§2.2) and the Agent-First MCP Design (`scratch/mcp-design.md` §2.3), raw exception messages return opaque errors that frequently trap LLM agents in unguided retry loops.

When a tool call fails (for example, attempting to merge an uncompleted task branch, linking an artifact across illegal spatial boundaries, or referencing a non-existent identifier), returning an unformatted stack trace or raw string forces the model to guess the correct remedy.

Implement structured Self-Recovery Error Envelopes for all 5 consolidated MCP tools:
- Standard error envelope: `{ isError: true, code: string, message: string, diagnostic: string, recovery: { action: string, tool: string, parameters: Record<string, unknown> } }`.
- Direct models toward concrete self-correction rather than blind retries:
  - `CRITERIA_INCOMPLETE`: points model to `modie_task_lifecycle(action: "check")` with missing checkboxes.
  - `ANCESTRY_VIOLATION_RULE_16`: explains spatial boundary violation and directs model to inspect container hierarchy via `modie_compile_context`.
  - `BLAST_RADIUS_BREACH_RULE_6`: identifies scope containment limits.
  - `ARTIFACT_NOT_FOUND`: directs model to search active artifacts via `modie_query_catalog`.
  - `INVALID_PARAMETER`: indicates exact schema failure and valid argument alternatives.

# Acceptance Criteria

- [ ] Standardize MCP tool execution error handler to construct structured `{ isError: true, code, message, diagnostic, recovery }` response payloads.
- [ ] Implement standardized error codes including `CRITERIA_INCOMPLETE`, `ANCESTRY_VIOLATION_RULE_16`, `BLAST_RADIUS_BREACH_RULE_6`, `ARTIFACT_NOT_FOUND`, and `INVALID_PARAMETER`.
- [ ] Provide actionable recovery objects suggesting discovery and remediation via `modie_query_catalog`, `modie_compile_context`, and `modie_task_lifecycle`.
- [ ] Verify model-recoverable error envelopes across invalid arguments, boundary breaches, and missing artifact scenarios in MCP test suite.
- [ ] User Review
