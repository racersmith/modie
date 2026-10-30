---
depends_on: []

links:
  - RULE-4
  - RULE-14
  - RULE-25
  - RULE-26
  - RULE-12
  - ADR-4
  - ADR-8
---

# Context

Introduce a standardized `summary` frontmatter field for ADR artifacts to support token-efficient progressive disclosure during context compilation (ADR-8, RULE-26). Because ADRs are immutable, discursive decision records (RULE-4, ADR-4), full document bodies create significant prompt bloat when compiled along upward directory ancestries. An explicit frontmatter summary provides a 1-2 sentence signpost of the core decision that can be emitted during context queries, while reserving full ADR inspection for on-demand reading. Update ADR types, templates, parser/query extractors, CLI creation flags (--summary), and MCP tool registrations.

# Acceptance Criteria

- [x] Update ADR core schema and render options (AdrRenderOptions, AdrDefinition) to support an optional summary frontmatter property
- [x] Update ADR template renderer to output summary: in canonical YAML frontmatter
- [x] Update artifact query and parser services (getArtifactDetails, resolveArtifactByTag) to extract summary from ADR frontmatter with sensible fallback when omitted
- [x] Expose --summary <text> flag in modie adr create CLI command and accept summary parameter in adr_create MCP tool
- [x] Backfill existing repository ADRs with concise summary frontmatter fields
- [x] Verify ADR creation, parsing, roundtrip serialization, and CLI/MCP interfaces in test suite
- [x] User Review
