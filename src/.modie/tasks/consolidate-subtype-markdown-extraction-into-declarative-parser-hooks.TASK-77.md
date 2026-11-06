---
summary: Replace hardcoded subtype branching in getArtifactDetails with uniform delegation to declarative subtype parser hooks.
depends_on:
  - TASK-76

links:
  - RULE-8
  - RULE-34
---

# Context

`getArtifactDetails` in `src/core/query/artifact-query.ts` currently contains hardcoded subtype checks (`if (subtype === "ADR") ... else if (subtype === "TASK") ...`) to invoke separate helper extractors (`extractAdrSummary`, `extractTaskSummary`).

Consolidate markdown summary and section extraction into the declarative `ArtifactDefinition.parse` hooks on each subtype definition. Simplify `getArtifactDetails` to uniformly delegate to `definition.parse(context)` without conditional subtype branching, adhering to the Open-Closed Principle.

# Acceptance Criteria

- [ ] Enhance ArtifactDefinition.parse to extract summary and domain-specific sections uniformly across all indexable subtypes
- [ ] Refactor getArtifactDetails to remove hardcoded subtype condition checks in favor of ctx.registry.get(subtype).parse
- [ ] Consolidate disparate markdown summary extraction helpers into subtype templates
- [ ] Verify all tests pass with bun test:parallel && bun check && bun check:circular
- [ ] User Review
