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

Refactor Tier 1 interface test suites (CLI commands and MCP server) to adopt isolated fixture workspaces (`createTestWorkspace`) and programmatic test tags (`makeTestTag`). Eliminates `Bun.$` shell commands, manual `mkdtemp` calls, raw markdown templates, and hardcoded tag literals across CLI and MCP integration tests.

# Acceptance Criteria

- [x] Migrate `src/interfaces/mcp/mcp.test.ts` to `createFixtureWorkspace` and programmatic tags, eliminating all `Bun.$` shell calls and hardcoded `TASK-101`/`RULE-101` literals
- [x] Migrate `src/interfaces/cli/commands/task/task-query.test.ts` to `createTestWorkspace` and `createTask`, eliminating 9 `mkdtemp` blocks and hardcoded `TASK-501`..`506` IDs
- [x] Migrate `src/interfaces/cli/commands/task/task-branching-cli.test.ts` to use `workspace.initGit()` and isolated fixture directories
- [x] Migrate `src/interfaces/cli/commands/rule/rule-create.test.ts` and `src/interfaces/cli/commands/adr/adr-create.test.ts` to `createTestWorkspace` with programmatic tags for creation output assertions
- [x] Migrate `src/interfaces/cli/commands/references/references.test.ts` fixture setup to `createTestWorkspace`
- [x] Verify all modernized Tier 1 test suites pass with zero false-positive citations during dogfooding reference queries
