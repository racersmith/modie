---
depends_on:
  - TASK-64

links:
  - RULE-7
  - RULE-13
  - RULE-14
  - RULE-15
  - RULE-16
  - RULE-18
  - RULE-19
  - RULE-28
  - RULE-33
---

# Context

Refactor validateLinkTarget (CC 39) in src/core/linking/validator.ts by replacing the 17-branch hardcoded subtype check with a declarative LinkPolicyTable specifying target subtypes, ancestry directionality, and cycle requirements. Decompose mergeTaskBranch (CC 36) in src/core/task/branching.ts by replacing error message string inspection with explicit pre-merge guard functions and typed domain error classes (TaskIncompleteError, ActiveSubtaskPendingError, ArtifactCollisionError).

# Acceptance Criteria

- [ ] Define a declarative LinkPolicyTable specifying allowed target subtypes, directionality (ancestor vs descendant), and cycle requirements per subtype
- [ ] Refactor validateLinkTarget to evaluate links against the policy table, reducing CC from 39 to <= 10
- [ ] Replace error message string matching in mergeTaskBranch with explicit pre-merge guard functions and typed domain error classes
- [ ] Decompose mergeTaskBranch into linear lifecycle stages, reducing CC from 36 to <= 10
- [ ] Verify link validation and task branch merge behavior against all link and task lifecycle tests
- [ ] User Review
