---
summary: Relocate over-scoped and pruned engine rules (RULE-38, RULE-33, RULE-31, RULE-36, RULE-2, RULE-9) to their deepest common ancestor scopes under src/core/ to eliminate task context bloat.

depends_on:
  - TASK-89-1

links:
  - RULE-6
  - RULE-8
  - RULE-12
  - RULE-16
  - RULE-17
  - ADR-10
---

# Context

Relocate core engine architectural rules that currently reside at src down to src/core or src/core/engine, shrinking task context bloat for downstream interface and domain tasks.

# Acceptance Criteria

- [x] RULE-38 is relocated to src/core/.modie/rules/ with valid container motive and graph invariants
- [x] RULE-33 is relocated to src/core/engine/.modie/rules/ with valid container and graph invariants
- [x] Scoped engine rules (RULE-31, RULE-36, RULE-2, RULE-9) are evaluated and relocated to least scope in src/core/engine/
- [x] modie scope audit confirms optimal least-scope placement across all relocated rules
- [x] Automated verification suite (bun run verify) passes cleanly
- [x] User Review
