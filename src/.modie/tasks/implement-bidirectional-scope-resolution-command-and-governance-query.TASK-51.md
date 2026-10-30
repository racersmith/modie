---
depends_on: []

links:
  - RULE-6
  - RULE-9
  - RULE-12
  - RULE-25
---

# Context

Implement a dedicated scope command and core resolution service that bidirectionally resolves codebase boundaries: given an artifact tag or identifier, resolve its target codebase directory, relative path, and ancestral scopes; given a file or directory path, resolve its enclosing .modie scope, applicable ancestral governance rules, and active tasks. As a foundational prerequisite, centralize governing scope resolution in `src/core/common/directories.ts` (`resolveGoverningScope`) to eliminate duplication across query, listing, and validation services.

# Acceptance Criteria

- [x] Centralize governing scope resolution utility (`resolveGoverningScope`) in core directories service and refactor artifact-query, artifact-list, and linking validators to consume it
- [x] Implement core domain resolver to compute bidirectional scope mappings for both artifact identifiers and arbitrary filesystem paths
- [x] Create declarative scope command definition exposing structured scope boundaries, enclosing .modie root, and ancestral rule chains
- [x] Ensure command adheres to interface-core decoupling (RULE-25) and emits actionable schema payloads
- [x] Verify bidirectional resolution for root, nested, and deep path scenarios in test suite
