---
summary: Consolidate graph traversal, context compilation, lifecycle ceremonies, and artifact pipelines under a dedicated engine namespace.
depends_on:
  - TASK-80

links:
  - ADR-13
  - RULE-38
---

# Context

Execute Phase 3 of the core layering architecture defined in ADR-13 and RULE-38. Group traversal (resolver), context compilation, linking, archival, and task lifecycle management into src/core/engine/, orchestrating domain models and consuming platform abstractions. Validate the complete facade export at src/core/index.ts.

# Acceptance Criteria

- [x] Consolidate graph traversal, context compilation, query, and linking services under dedicated engine namespace
- [x] Consolidate task lifecycle branching, completion ceremony, and pipeline creation within engine namespace
- [x] Ensure unidirectional dependency flow where engine services orchestrate domain models through platform abstractions
- [x] Verify complete public API facade parity at core entrypoint with zero modifications required in interface consumers
- [x] verify `bun run verify` passes
- [x] User Review
