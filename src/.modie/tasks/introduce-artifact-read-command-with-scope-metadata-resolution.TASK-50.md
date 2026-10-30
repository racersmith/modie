---
depends_on: []

links:
  - RULE-25
  - RULE-26
  - RULE-12
  - ADR-1
---

# Context

Rename and promote the artifact inspection workflow to read (maintaining show as a backwards-compatible alias), and enrich artifact query results with the resolved codebase directory scope (the directory containing the artifact's .modie parent folder relative to workspace root) to provide agents and developers with both artifact contents and their governing codebase boundaries in a single query.

# Acceptance Criteria

- [ ] Resolve governing directory scope (scope: string) in core artifact query services (resolveArtifactByTag, getArtifactDetails)
- [ ] Introduce read command definition and handler delivering parsed artifact contents, frontmatter links, acceptance criteria, and resolved scope
- [ ] Maintain show as a backwards-compatible alias to read across CLI command execution
- [ ] Verify read and show deliver identical structured payloads including scope across test suites
