---
depends_on:
  - TASK-64

links:
  - ADR-6
  - RULE-6
  - RULE-25
  - RULE-26
  - RULE-28
  - RULE-32
---

# Context

Implement the consolidated five-tool agent-first MCP server architecture in the MCP interface module per `scratch/mcp-design.md`, replacing the naive 1:1 CLI command iteration loop with 5 goal-oriented tools (`modie_compile_context`, `modie_query_catalog`, `modie_task_lifecycle`, `modie_create_artifact`, `modie_mutate_governance`). Each tool defines its own flat Zod schema, explicit `outputSchema` contract, behavioral annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`), stateless arguments with branch fallback, and GIST-first progressive disclosure (`detail_level: "gist" | "full"`). This task absorbs previous granular milestones TASK-45, TASK-46, and TASK-48 into a single cohesive architecture.

# Acceptance Criteria

- [x] Replace 1:1 CLI command auto-registration in MCP server with 5 consolidated tools: `modie_compile_context`, `modie_query_catalog`, `modie_task_lifecycle`, `modie_create_artifact`, and `modie_mutate_governance`
- [x] Define flat Zod input schemas and output schemas for all 5 consolidated tools with `detail_level="gist"` as the default response mode
- [x] Declare behavioral annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) natively on each tool registration
- [x] Support stateless explicit parameters (`task_id`, `scope_dir`, `target`) across tools with effortless fallback to active Git branch state
- [x] Auto-inject Mission Brief, criteria checklist, blast radius constraint, and ambient guardrails on `modie_task_lifecycle(action="start")`
- [x] Support batched criteria checking (`check_items: number[]`) and atomic 2-phase commit completion and merge (`action="complete_and_merge"`) in `modie_task_lifecycle`
- [x] Support atomic creation with initial links (`initial_links: string[]`) and template scaffolding mode (`scaffold_only: true`) in `modie_create_artifact`
- [x] Support batch linking and unlinking (`targets: string[]`) and unified rule/ADR archival in `modie_mutate_governance`
- [x] Verify via test suite that `tools/list` exposes exactly the 5 consolidated tools with declared annotations, output schemas, and clean execution returns
- [x] User Review
