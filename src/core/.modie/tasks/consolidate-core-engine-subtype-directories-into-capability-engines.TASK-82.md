---
summary: Eliminate vestigial subtype directories in src/core/engine by routing artifact creation through pipeline workflows and encapsulating task state orchestration into a dedicated lifecycle engine.
depends_on: []

links:
  - ADR-13
  - RULE-38
---

# Context

## Problem & Friction
`src/core/engine` currently hosts artifact subtype directories (`adr/`, `rule/`, `task/`, `motive/`, `gist/`) that mirror directories in `src/core/domain/`. For declarative subtypes like ADR and Rule, these engine directories contain minimal pass-through boilerplate (~60–80 lines in `creation.ts`) that simply delegates to the generic `createArtifact` pipeline. Meanwhile, other artifact operations (querying, listing, archival, supersession, link validation) are already handled in capability-based engine modules (`query/`, `archival/`, `linking/`, `pipeline/`).

This mirroring creates developer friction and cognitive overhead:
- Ambiguity over whether logic belongs in `domain/<artifact>` or `engine/<artifact>`.
- Export collisions in `src/core/index.ts`, forcing explicit facade disambiguation overrides.
- Unnecessary proliferation of "empty-shell" folders in `engine/`.

## Architectural Direction
In alignment with ADR-13 and RULE-38:
1. **Domain Layer (`src/core/domain/`)**: Remains the single source of truth for pure artifact models, AST/markdown templates, link policies, and `ArtifactDefinition` schemas (pure functions, zero I/O).
2. **Engine Layer (`src/core/engine/`)**: Exclusively hosts workflow capabilities and orchestration services (`pipeline/`, `query/`, `linking/`, `archival/`, `traversal/`, `lifecycle/`).
3. **Consolidation**:
   - Eliminate redundant engine subtype directories (`engine/adr/`, `engine/rule/`). Move creation convenience wrappers (`createAdr`, `createRule`) to `engine/pipeline/` or export them directly from the core facade.
   - Encapsulate the ephemeral task state machine, git branch guards, readiness evaluation, and completion ceremonies into a dedicated `lifecycle/` engine module, recognizing that Tasks are ephemeral stateful workflows rather than static declarative records.
   - Clean up `src/core/index.ts` to remove facade disambiguation overrides while preserving stable, backward-compatible public API imports for `src/interfaces/cli` and `src/interfaces/mcp`.

# Acceptance Criteria

- [x] Migrate declarative artifact creation services from isolated engine subtype directories to pipeline orchestration services
- [x] Encapsulate ephemeral task state machine, branching coordination, and completion ceremonies into a dedicated lifecycle engine module
- [x] Eliminate redundant engine subtype directories and remove facade export disambiguation overrides from core entry point
- [x] Enforce unidirectional dependency boundaries across domain, engine, and platform layers per architectural invariants
- [x] passes `verify` tests.
- [x] User Review
