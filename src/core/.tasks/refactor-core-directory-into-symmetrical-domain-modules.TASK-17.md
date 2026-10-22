---
depends_on: []

links:
  - ADR-1
  - ADR-2
  - RULE-1
  - RULE-8
  - RULE-25
---

# Context

Refactor the core architecture to establish domain-driven locality and symmetrical parity with interfaces: group loose service files and primitive templates into cohesive domain modules (src/core/task, src/core/rule, src/core/query, src/core/common, src/core/resolver), eliminate the redundant primitives/ indirection layer, colocate domain tests, and maintain public API stability via src/core/index.ts per RULE-25.

# Acceptance Criteria

- [x] Consolidate task domain primitives and services into src/core/task/ (types, template, creation, completion, query, and tests)
- [x] Consolidate rule domain primitives and services into src/core/rule/ (types, template, creation, ancestry validation, and tests)
- [x] Relocate artifact query and inspection services into src/core/query/
- [x] Elevate common primitives from primitives/common/ to src/core/common/ and clean up empty primitives/ stubs
- [x] Preserve public core API surface in src/core/index.ts per RULE-25 and verify all tests, typecheck, and build pass with zero regression
