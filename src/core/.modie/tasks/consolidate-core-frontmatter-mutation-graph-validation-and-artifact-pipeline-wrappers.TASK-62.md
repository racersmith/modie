---
depends_on: []

links:
  - ADR-4
  - ADR-5
  - RULE-4
  - RULE-8
  - RULE-16
  - RULE-17
  - RULE-18
  - RULE-19
  - RULE-36
---

# Context

Unify frontmatter list mutation between supersession and linking, extract a shared validation primitive enforcing spatial ancestry and subtype invariants across creation and linking, and collapse thin subtype creation/archival wrappers to standardize on CreateArtifactResult.

# Acceptance Criteria

- [x] Extend frontmatter list mutator to handle supersedes and superseded_by fields and delegate supersession updating to it
- [x] Extract shared validation primitive enforcing allowed target subtypes and spatial ancestry across rule, adr, and task creation and linking
- [x] Consume shared link validation primitive in rule, adr, and task artifact definition validation hooks
- [x] Standardize subtype creation and archival domain services to return unified CreateArtifactResult payloads via the artifact registry
- [x] Verify frontmatter mutation, ancestry validation, and creation pipelines across comprehensive unit tests
- [x] User Review
