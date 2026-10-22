---
depends_on: []

links:
  - ADR-1
  - ADR-4
  - RULE-1
  - RULE-8
  - RULE-25
---

# Context

Unify artifact lifecycle operations across rules, tasks, and ADRs into a declarative artifact schema and generic creation pipeline to eliminate boilerplate and simplify registering new artifact subtypes.

# Acceptance Criteria

- [x] Define a declarative ArtifactDefinition schema specifying subtype tag, container directory, link validation rules, and template generator
- [x] Implement a generic createArtifact pipeline service handling slugging, monotonic ID allocation, directory resolution, and file writing
- [x] Refactor existing rule, task, and adr creation services to consume the unified pipeline without breaking public core contracts
- [x] Add unit and integration tests verifying polymorphic artifact creation and link validation
