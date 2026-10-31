---
depends_on: []

links:
  - RULE-10
  - RULE-2
  - RULE-8
  - RULE-12
  - ADR-2
  - ADR-10
  - ADR-4
---

# Context

Introduce a dedicated `motive create` command and core domain creation service to scaffold `MOTIVE.md` intent files within target directory scopes. As a discoverable primitive artifact (ADR-2, ADR-4, ADR-10), `MOTIVE.md` establishes scope-level purpose and trajectory without numeric IDs or cross-document links. The creation workflow must enforce singleton containment at `<dir>/.modie/MOTIVE.md`, guard against accidental overwrites, and validate compliance with RULE-10 by prohibiting artifact citations.

# Acceptance Criteria

- [x] Implement core domain service to create and scaffold MOTIVE.md within a target directory .modie container or workspace root
- [x] Enforce singleton collision guard rejecting creation if MOTIVE.md already exists in the target scope unless overwrite is explicitly requested
- [x] Validate initial motive content against RULE-10 asserting rejection if artifact tags or cross-document references are present
- [x] Expose declarative motive create CLI command and MCP tool conforming to interface decoupling and structured output contracts
- [x] Verify motive creation, template scaffolding, collision protection, and reference rejection across test suites
- [x] User Review
