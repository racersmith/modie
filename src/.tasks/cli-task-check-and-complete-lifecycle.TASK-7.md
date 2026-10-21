---
depends_on: []

links:
  - ADR-1
  - ADR-6
  - RULE-21
  - RULE-22
  - RULE-25
  - RULE-27
  - RULE-28
---

# Context

Implement programmatic checklist progression (canon task check) and automated task completion lifecycle (canon task complete) per ADR-6, RULE-21, and RULE-22.

# Acceptance Criteria

- [x] Implement core checklist progression service in core
- [x] Implement core task completion and deletion service in core
- [x] Implement CLI command canon task check
- [x] Implement CLI command canon task complete
- [x] Ensure strict stdout and stderr separation per RULE-27
