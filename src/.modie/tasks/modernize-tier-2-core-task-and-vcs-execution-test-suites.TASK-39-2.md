---
depends_on:
  - TASK-39-1

links:
  - RULE-21
  - RULE-22
  - RULE-25
  - RULE-28
  - RULE-30
  - RULE-34
  - ADR-6
  - ADR-7
  - ADR-9
---

# Context

Refactor Tier 2 core task and VCS execution test suites to adopt createFixtureWorkspace, hermetic git setup (initGit, gitCommit), and programmatic test tags. Eliminates manual git ceremony subprocess calls, raw markdown frontmatter manipulation, and hardcoded TASK- IDs across core task engines.

# Acceptance Criteria

- [x] Migrate src/core/task/task-completion.test.ts to createFixtureWorkspace, replacing 8 mkdtemp blocks and 4 manual git setups with workspace.initGit() and workspace.createTask()
- [x] Migrate src/core/task/task-query.test.ts to createFixtureWorkspace and declarative task creation, eliminating hardcoded TASK-100..113 literals
- [x] Migrate src/core/task/task-branching.test.ts and src/core/vcs/vcs.test.ts to hermetic git fixture workspaces
- [x] Verify all Tier 2 test suites pass with zero orphaned temp directories and zero false-positive citations during reference queries
