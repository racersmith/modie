---
depends_on: []

links:
  - RULE-15
  - RULE-21
  - RULE-22
  - RULE-23
  - RULE-30
  - ADR-6
  - ADR-7
---

# Context

Front-load planned RULEs and ADRs into task definition by adding an optional Planned Governance section to the task template and CLI creation flags. Validate that planned governance artifacts exist before task completion.

Inject distilled task authoring best practices, anti-pattern warnings, and workflow guidance directly into MCP tool descriptions and server documentation. Key insights to embed include:

1. **Ephemeral Task Decoupling**: If an agent or engineer finds themselves wanting to reference `TASK-XX` in a test description (e.g. `[TASK-XX]`) or code comment (e.g. `@verifies TASK-XX`), STOP and author a new `RULE` or `ADR`. Code and tests must never reference ephemeral task IDs; they must only reference durable `ADR-` and `RULE-` artifacts (RULE-21, RULE-23, ADR-6).
2. **Contract-Based Acceptance Criteria (RULE-30)**: Define task deliverables in terms of component roles, behavioral contracts, or testable capabilities rather than concrete filesystem paths that rot across refactorings.
3. **Upfront Governance Extraction**: Front-load governance planning by identifying candidate rules and decisions during task creation (in `Planned Governance`) before starting implementation.

# Acceptance Criteria

- [ ] Add optional Planned Governance section to task template and task create flags
- [ ] Enforce planned governance artifacts are generated before task completion
- [ ] Inject distilled task-authoring guidance and anti-pattern warnings (ephemeral task decoupling, contract-based criteria) into MCP tool descriptions and server documentation
- [ ] Add unit and integration tests verifying planned governance validation and MCP guidance

