---
summary: Clean up makeTestTag layer violation, duplicate fixture option types, scanActiveTasks wrapper, CLI index partial exports, and deprecated context aliases.
depends_on: []

links:
  - RULE-38
  - RULE-35
  - ADR-9
  - RULE-28
---

# Context

Following the elimination of core root facades and intra-module re-exports, several legacy patterns remain: 
1) makeTestTag in platform/testing duplicates formatArtifactTag and causes domain tests to violate RULE-38
2) fixture-workspace.ts defines shadow option types
3) scanActiveTasks wraps scanActiveArtifacts
4) interfaces/cli/index.ts has arbitrary partial exports
5) domain schemas maintain deprecated context aliases
6) CLI test utilities mix import styles. 

This task orchestrates the complete cleanup across these areas via structured sub-tasks.

# Acceptance Criteria

- [x] All child sub-tasks for codebase cleanup completed and verified
- [x] makeTestTag eliminated in favor of canonical formatArtifactTag
- [x] Duplicate option types in fixture-workspace consolidated with domain definitions
- [x] scanActiveTasks wrapper retired in favor of scanActiveArtifacts
- [x] interfaces/cli/index.ts export declarations cleaned up
- [x] Deprecated context aliases removed across domain schemas and pipelines
- [x] CLI test utility imports standardized
- [x] Full verification suite passes cleanly via bun run verify
- [x] User Review
