---
summary: Consolidate host I/O primitives (VCS, Markdown, Config) under a dedicated platform namespace and decouple test fixture harnesses from production domain exports.
depends_on: []

links:
  - ADR-13
  - RULE-38
---

# Context

Execute Phase 1 of the core layering architecture defined in ADR-13 and RULE-38. Group host-dependent modules (vcs, markdown, config) into src/core/platform/ and isolate test fixture workspace utilities from the core domain package. Preserve public API exports via src/core/index.ts.

# Acceptance Criteria

- [ ] Relocate VCS adapters, Markdown codecs, and configuration loaders into dedicated platform namespace
- [ ] Decouple test fixture workspace utilities from production core package exports
- [ ] Preserve public API exports in core root facade without mutating interface consumers
- [ ] Verify circular dependency absence and parallel test suite execution
- [ ] User Review
