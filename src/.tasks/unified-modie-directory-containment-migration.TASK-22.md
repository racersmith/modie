---
depends_on:
  - TASK-21

links:
  - ADR-1
  - ADR-3
  - ADR-4
  - ADR-10
  - RULE-8
  - RULE-20
  - RULE-25
  - RULE-31
---

# Context

Migrate repository directory structure and resolution engine to the unified .modie/ containment architecture per ADR-10, update RULE-8, and safely archive superseded ADR-3.

# Acceptance Criteria

- [ ] Update RULE-8 assertion and scope normalization logic to resolve .modie/<subtype> container directories
- [ ] Update directory resolution services to generate .modie/<subtype> target directories by default
- [ ] Migrate existing repository governance directories and scope motive files into unified .modie/ containers
- [ ] Update dependent rules to reference ADR-10 and execute guarded archival of ADR-3 via modie adr archive
- [ ] Run test suite and typechecks verifying full project functionality under the unified .modie/ directory structure
