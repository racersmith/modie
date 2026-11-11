---
summary: Eliminate makeTestTag across all test files and testing utilities, standardizing on domain canonical formatArtifactTag to eliminate RULE-38 cross-layer dependency.
depends_on: []

links:
  - RULE-38
  - RULE-35
---

# Context

makeTestTag in platform/testing duplicates formatArtifactTag in domain/common/tag.ts and forces domain unit tests to violate RULE-38 by importing from platform/testing. This sub-task eliminates makeTestTag completely, standardizing all tests across the repository on canonical formatArtifactTag.

# Acceptance Criteria

- [ ] makeTestTag removed from src/core/platform/testing/fixture-workspace.ts and index.ts
- [ ] All domain, engine, platform, cli, and mcp test files updated to use formatArtifactTag directly
- [ ] RULE-35 docstring updated to cite formatArtifactTag instead of makeTestTag
- [ ] All tests pass via bun run verify test
- [ ] User Review
