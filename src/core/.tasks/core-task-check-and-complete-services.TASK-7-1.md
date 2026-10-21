---
depends_on: []

links:
  - ADR-6
  - RULE-21
  - RULE-22
  - RULE-25
---

# Context

Implement checkTaskItem and completeTask domain services in src/core per ADR-6, RULE-21, and RULE-22.

# Acceptance Criteria

- [ ] Implement checkTaskItem to toggle markdown checklist items per RULE-22
- [ ] Implement completeTask to verify all criteria checked and delete file per RULE-21
- [ ] Export services via src/core/index.ts
- [ ] Add comprehensive unit tests in src/core/task-completion.test.ts
