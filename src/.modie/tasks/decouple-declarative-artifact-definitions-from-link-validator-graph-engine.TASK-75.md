---
summary: Separate pure link syntax predicates and remove direct validator engine imports from declarative artifact definitions to prevent circular dependency cycles.
depends_on:
  - TASK-74

links:
  - RULE-8
  - RULE-34
---

# Context

`src/core/registry.ts` registers concrete artifact definitions (`ruleDefinition`, `adrDefinition`, `taskDefinition`). Each definition statically imports `validateLinkTarget` from `src/core/linking/validator.ts` for its `.validate` hook. Because `validator.ts` performs deep graph queries and disk inspection, it creates a multi-hop dependency vulnerability between registry, definitions, validator, queries, and context.

Extract pure syntax predicates (`isValidAdrLinkTag`, `isValidGovernanceLinkTag`, `isValidTaskDependencyTag`) into `src/core/linking/syntax.ts`. Move link validation execution from static definition objects into the generic pipeline runner (`createArtifact`) driven by declarative `definition.linkPolicy`. Ensure artifact definition files remain pure declarative schemas decoupled from disk inspection engines.

# Acceptance Criteria

- [x] Extract tag and link syntax predicates into src/core/linking/syntax.ts
- [x] Remove direct imports of validator.ts from rule/definition.ts, adr/definition.ts, and task/definition.ts
- [x] Delegate link validation in createArtifact dynamically via declarative definition.linkPolicy
- [x] `bun verify` passes all tests.
- [x] User Review
