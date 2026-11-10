---
summary: Replace duplicated command boilerplate and table formatting logic across CLI artifact commands with reusable command factories.
depends_on:
  - TASK-82

links:
  - RULE-25
  - RULE-27
---

# Context

## Problem & Duplication
CLI commands for listing and creating artifacts (e.g. `src/interfaces/cli/commands/adr/list.ts` vs `src/interfaces/cli/commands/rule/list.ts`) currently copy-paste nearly identical Zod schemas, table column calculation, aligned table formatting, and execution wiring across subtypes. This redundant boilerplate creates shotgun surgery whenever command formatting, pagination, or table layouts change.

## Framework Factory Generalization
In alignment with RULE-25 (interface-core decoupling) and RULE-27 (stdout/stderr separation):
1. Introduce reusable command factories in `src/interfaces/cli/framework/` parameterized by artifact subtype and `ArtifactDefinition`.
2. Standardize listing and table formatting logic into shared presentation helpers so individual commands become concise, declarative definitions.
3. Ensure that adding a new artifact subtype or extending artifact metadata only requires updating its domain definition rather than duplicating CLI command implementations.

# Acceptance Criteria

- [ ] Implement reusable command factory producing standardized listing command definitions and aligned table formatters across indexable subtypes
- [ ] Refactor individual artifact listing commands to consume standardized framework factories
- [ ] Preserve stdout and stderr separation and formatting consistency across all artifact commands
- [ ] passes `verify` tests.
- [ ] User Review
