---
depends_on: []

links:
  - RULE-25
  - RULE-26
  - RULE-12
  - ADR-1
---

# Context

Promote the artifact inspection workflow to read (purging the legacy show command), and enrich artifact query results with the resolved codebase directory scope (the directory containing the artifact's .modie parent folder relative to workspace root) to provide agents and developers with both artifact contents and their governing codebase boundaries in a single query.

# Acceptance Criteria

- [x] Resolve governing directory scope (scope: string) in core artifact query services (resolveArtifactByTag, getArtifactDetails)
- [x] Introduce read command definition and handler delivering parsed artifact contents, frontmatter links, acceptance criteria, and resolved scope
- [x] Purge legacy show command across CLI dispatching and MCP interfaces
- [x] Verify read command delivers structured payloads including scope and reject show across test suites
