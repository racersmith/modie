---
depends_on:
  - TASK-39

links:
  - RULE-23
  - RULE-25
  - RULE-27
  - RULE-30
  - RULE-34
  - ADR-6
  - ADR-7
  - ADR-9
---

# Context

Refactor remaining test suites across the CLI, MCP, and Core packages to integrate with the standardized FixtureWorkspace helpers and programmatic test tags (makeTestTag). Eliminates raw mkdtemp calls, manual git ceremony boilerplate, and hardcoded tag literals across all three modernization tiers, enforcing RULE-34 and preventing dogfooding citation pollution.

# Acceptance Criteria

- [ ] Modernize CLI and MCP integration test suites (mcp, task-query, task-branching-cli, rule-create, adr-create, references) using isolated fixture workspaces and programmatic test tags without hardcoded tag literals
- [ ] Modernize core task and VCS execution test suites (task-completion, task-query, task-branching, vcs) replacing manual git setup and raw markdown scaffolding with hermetic FixtureWorkspace helpers
- [ ] Modernize core governance resolution and archival test suites (rule-supersession, adr-supersession, rule-creation, adr-creation, archival, watermark) using typed fixture generation
- [ ] Verify the entire test suite passes cleanly with zero orphaned temporary directories and zero false-positive test citations on active governance rules
