---
depends_on: []

links:
  - ADR-1
  - ADR-2
  - ADR-3
  - ADR-4
  - RULE-1
  - RULE-8
  - RULE-25
  - RULE-29
---

# Context

Loft reusable artifact domain primitives from TASK into shared core modules to support RULE and ADR artifact creation without duplication. Generalize watermark resolution and active scanning to allocate monotonic unpadded integer IDs across all indexable subtypes (RULE, ADR, TASK) per ADR-1, ADR-2, RULE-1, and RULE-8.

# Acceptance Criteria

- [ ] Extract common slug generator and kebab-case validator into shared primitive module
- [ ] Implement generalized artifact filename formatter and parser supporting RULE, ADR, and TASK per RULE-1
- [ ] Generalize directory resolution to map any subtype to its container (.rules/, .adrs/, .tasks/) or flat placement per RULE-8
- [ ] Generalize active scanner and Git history watermark resolver to discover and allocate next monotonic IDs for RULE and ADR subtypes
- [ ] Add unit tests verifying generalized filename parsing, subtype directory resolution, and monotonic watermark allocation across all subtypes
