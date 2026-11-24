---
summary: Separate pre-merge collision detection and historical task querying into dedicated modules and split the branching test suite with reusable Git fixture helpers.

depends_on: []

links:
  - RULE-28
  - RULE-33
  - RULE-34
  - RULE-35
  - RULE-38
---

# Context

Separate pre-merge artifact collision detection from branch-policy and completion guards; separate historical Git task and multi-branch reconstruction from active task queue and status queries; add reusable lifecycle Git ceremony test helpers (such as trunk/protected branch setup and task completion commits) to remove repetitive shell boilerplate; and split the monolithic branching test file into focused suites for collisions, guard units, core hierarchical branching, and origin-tracking merge-back automation. Preserve all public lifecycle exports and acyclic module boundaries.

# Acceptance Criteria

- [ ] Pre-merge artifact collision analysis is extracted into a dedicated collision-guard module separate from branch-policy and completion guards while preserving all public lifecycle exports
- [ ] Historical Git task and multi-branch reconstruction is extracted into a dedicated history-query module separate from active task queue and status queries
- [ ] Shared lifecycle test fixture helpers encapsulate repetitive Git branch setup and task deletion ceremony without coupling to host repository state
- [ ] Branching tests are split into focused suites covering artifact collisions, pre-merge guard units, hierarchical branching workflows, and origin-tracking merge-back automation, with all repository verification checks passing
- [ ] User Review
