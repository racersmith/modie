---
depends_on: []

links:
  - ADR-1
  - ADR-4
  - RULE-4
  - RULE-25
  - RULE-27
  - RULE-31
---

# Context

Unify supersession linking, frontmatter updates, and archival workflow across all indexable governance artifacts (ADR and RULE). Extract shared supersession engine into pipeline primitive, enable --supersedes for modie rule create, and expose top-level modie archive <tag> CLI command.

# Acceptance Criteria

- [x] Extract generic updateSupersededArtifactFrontmatter service in core pipeline supporting both ADR and RULE subtypes
- [x] Add --supersedes option to rule creation core service and modie rule create CLI command with bidirectional frontmatter updates
- [x] Implement unified modie archive <tag> root CLI command automatically inferring subtype from canonical tag with --force and --json support
- [x] Retain modie adr archive and modie rule archive as transparent aliases delegating to the unified archive command
- [x] Add unit and integration tests verifying rule supersession, bidirectional link updates, and root archive command execution
