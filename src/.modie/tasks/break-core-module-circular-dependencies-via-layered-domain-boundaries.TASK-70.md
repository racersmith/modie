---
depends_on:
  - TASK-65
  - TASK-66
  - TASK-67
  - TASK-68
  - TASK-69

links:
  - RULE-1
  - RULE-8
  - RULE-28
---

# Context

Per the maintainability review (§2.1, §3.2, §3.3, §5), `src/core` currently suffers from 8 bidirectional module cycles, an inverted dependency structure where generic abstractions import concrete implementations, and a bloated public facade:

1. **Circular Module Cycles (8 Mutual 2-Cycles)**:
   - `pipeline <-> adr`, `pipeline <-> rule`, `pipeline <-> task`, `pipeline <-> query`
   - `query <-> task`
   - `archival <-> adr`, `archival <-> rule`
   - `vcs <-> resolver`
   - Root cause: foundational logic lives in higher-level domains (`markdown-parser.ts` in `query/`, `parseCanonicalTag` in `query/`, `normalizeTaskId` in `task/`), and `IVcsAdapter` returns domain `DiscoveredArtifact` types from `resolver/`.

2. **Inverted Registry Architecture**:
   - Generic `pipeline/create.ts` currently imports concrete subtype definitions directly to populate a static `ARTIFACT_DEFINITIONS` map.
   - Invert the registry: `pipeline` defines `ArtifactDefinition` and `DefinitionRegistry`. Concrete subtype definitions (`rule`, `adr`, `task`) register themselves via a dedicated composition root `src/core/registry.ts`.
   - Split `IVcsAdapter` into a pure VCS operations port and extract artifact-specific git tree inspection into `src/core/resolver/artifact-history.ts`.

3. **Subtype Typing & Core Facade Cleanup**:
   - Subtypes are stringly-typed (`IndexableSubtype = "RULE" | "ADR" | "TASK" | (string & {})`), leading to 67 defensive `.toUpperCase()` calls and 41 literal `=== "TASK" / "RULE"` comparisons throughout core logic. Introduce branded `ArtifactTag` and `ArtifactSubtype` types normalized once at boundaries.
   - `src/core/index.ts` is currently a 272-line facade exporting conflicting duplicate access paths (namespaces such as `TaskPrimitive` alongside flat function exports and type wildcards). Streamline `core/index.ts` to export canonical flat named exports backed by module `index.ts` files.
   - Consolidate duplicated archival wrappers (`adr/archive.ts` ≡ `rule/archive.ts`) into a unified core archival service.
   - Consolidate pipeline context types: unify `ArtifactValidationContext` and `ArtifactAllocationContext` into `ArtifactPlanContext`.

# Acceptance Criteria

- [x] Establish foundational layer (`src/core/common`, `src/core/markdown`) for tag grammar, path normalization, and frontmatter handling without upward imports.
- [x] Invert `ArtifactDefinition` registration: `pipeline` defines `DefinitionRegistry`; concrete definitions register via a composition root `src/core/registry.ts`.
- [x] Separate `IVcsAdapter` into pure VCS operations and move artifact-specific git tree inspection into `src/core/resolver/artifact-history.ts`.
- [x] Consolidate `adr/archive.ts` and `rule/archive.ts` into a shared subtype-agnostic core archival service.
- [x] Introduce branded `ArtifactTag` and `ArtifactSubtype` types to eliminate redundant `.toUpperCase()` and defensive string checks.
- [x] Unify `ArtifactValidationContext` and `ArtifactAllocationContext` into `ArtifactPlanContext` in `src/core/pipeline/types.ts`.
- [x] Streamline `src/core/index.ts` to export canonical flat named exports backed by module-level `index.ts` entry points, retiring redundant namespace objects.
- [x] Break all 8 mutual 2-cycles across `src/core`, verified via `bun run check:complexity cycles`.
- [x] Verify entire test suite passes cleanly with zero regressions.
- [x] User Review
