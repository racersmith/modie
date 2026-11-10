---
summary: Group core artifact subtype models (ADR, Rule, Task, Motive, Gist) and common primitives under a dedicated domain namespace with zero outward dependencies.
depends_on:
  - TASK-79

links:
  - ADR-13
  - RULE-38
---

# Context

Execute Phase 2 of the core layering architecture defined in ADR-13 and RULE-38. Consolidate subtype definitions, frontmatter validation, and common graph primitives under src/core/domain/, ensuring pure domain models do not import from platform or engine services.

# Acceptance Criteria

- [x] Consolidate subtype definitions (ADR, RULE, TASK, MOTIVE, GIST) and common primitives under dedicated domain namespace
- [x] Centralize artifact registry and composition root within domain layer
- [x] Enforce invariant that domain models contain zero imports to platform or engine services
- [x] verify `bun run verify` passes
- [x] User Review
