---
depends_on:
  - TASK-70

links:
  - RULE-8
  - RULE-34
---

# Context

Per the maintainability review (§1, §2.1, §2.4, §6.16), deep domain functions throughout `src/core` suffer from implicit global state and leaky test seams:

1. **Implicit Globals & Leaky Test Seams**:
   - 110 separate `process.cwd()` fallbacks and 39 `?? defaultVcsAdapter` fallbacks outside `src/core/vcs/` allow domain logic to silently bind to ambient process directories and real git execution.
   - Test seams leak into production parameter signatures (e.g. `resolveWatermark` options such as `activeIds`, `otherBranchActiveIds`, `deletedIds`, and `gitConfigPrefix`).
   - Mutable module-level state in `registeredSubtypes` (`src/core/common/filename.ts`) creates leaky test seams requiring manual `resetRegisteredArtifactSubtypes()` resets between test runs.

2. **Explicit Workspace Context**:
   - Introduce an explicit, immutable context container:
     ```ts
     interface WorkspaceContext {
       readonly root: string;
       readonly vcs: IVcsAdapter;
       readonly config: ModieConfig;
       readonly registry: DefinitionRegistry;
     }
     ```
   - Construct `WorkspaceContext` once at the interface entry points (CLI command execution boundary, MCP server startup).
   - Thread `WorkspaceContext` explicitly through domain pipelines, removing hidden `process.cwd()` and `defaultVcsAdapter` fallbacks.
   - Eliminate mutable module-level state in `registeredSubtypes` in favor of an instance-scoped registry on `WorkspaceContext`.
   - Clean up leaky test seams across core domain signatures.

# Acceptance Criteria

- [ ] Introduce `WorkspaceContext` interface (`root`/`cwd`, `vcs`, `config`, `registry`) initialized at interface boundaries and passed explicitly into domain services.
- [ ] Replace implicit `process.cwd()` and `defaultVcsAdapter` defaults in domain functions with explicit `WorkspaceContext` references.
- [ ] Eliminate mutable module-level state in `registeredSubtypes` in favor of instance-scoped registry on `WorkspaceContext`.
- [ ] Clean up leaky test seams across core domain signatures.
- [ ] Verify complete test suite passes with zero regressions.
- [ ] User Review
