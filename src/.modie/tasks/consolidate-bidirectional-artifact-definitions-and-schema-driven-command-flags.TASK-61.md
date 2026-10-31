---
depends_on:
  - TASK-54

links:
  - ADR-4
  - RULE-12
  - RULE-25
  - RULE-34
---

# Context

Adding a single metadata field across an artifact subtype currently requires shotgun edits across separate write-side definitions, read-side query parsers, duplicate frontmatter parsers, redundant DTO interfaces, and 4x duplicated CLI command flag definitions. Consolidate the artifact pipeline and command framework so each subtype's ArtifactDefinition owns both rendering and parsing backed by a single unified frontmatter/section parser, test fixtures delegate to canonical template renderers, and CLI command flags derive metadata from their declarative Zod schemas.

# Acceptance Criteria

- [x] Extend declarative ArtifactDefinition contract to support bidirectional serialization and parsing for indexable subtypes
- [x] Unify frontmatter and section parsing into a single shared core parser consumed across query, task, and reference services
- [x] Delegate fixture workspace artifact creation helpers to canonical subtype template renderers to eliminate parallel markdown builders
- [x] Infer default CLI flag descriptions and types from declarative command Zod schemas to eliminate redundant flag boilerplate
- [x] Verify roundtrip creation, parsing, query inspection, and CLI/MCP execution across all subtypes in test suite
- [x] User Review
