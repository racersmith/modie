---
depends_on: []

links:
  - RULE-25
  - RULE-30
  - RULE-34
---

# Context

Enhance createFixtureWorkspace and test architecture utilities with encapsulated directory manipulation (workspace.mkdir), path resolution (workspace.resolve), auto-trimming file reading (workspace.readFile), file removal (workspace.remove), and high-speed Git test configurations (gc.auto=0, core.compression=0, commit.gpgsign=false, core.preloadindex=true). Modernize subprocess execution to native Bun.spawn in test harnesses and integration suites, eliminating raw Node.js filesystem imports (node:fs/promises, node:path) and child_process boilerplate.

# Acceptance Criteria

- [x] Add encapsulated mkdir, resolve, and remove helpers to FixtureWorkspace and enhance readFile / fileExists / readJson to auto-trim paths and accept stdout output directly
- [x] Optimize workspace.initGit with high-speed test configs (gc.auto=0, core.compression=0, commit.gpgsign=false, core.preloadindex=true)
- [x] Modernize MCP server subprocess tests (src/interfaces/mcp/mcp.test.ts) and CLI test harness (src/interfaces/cli/test-utils.ts) to native Bun.spawn, removing node:child_process imports and event listener boilerplate
- [x] Modernize CLI archive test suites (adr-archive.test.ts, rule-archive.test.ts, archive.test.ts) to use workspace.readFile(stdout) directly, removing node:fs/promises and node:path imports
- [x] Modernize governance creation test suites (adr-creation.test.ts, rule-creation.test.ts) to use workspace.mkdir and workspace.resolve, removing node:fs/promises and node:path imports
- [x] Modernize file deletion across core and CLI test suites (vcs.test.ts, task-branching.test.ts, task-query.test.ts, task-completion.test.ts, task-branching-cli.test.ts) to use workspace.remove(artifact)
- [x] Modernize remaining join(workspace.cwd, ...) usages across core test suites to use workspace.resolve
- [x] Verify all test suites pass with zero regressions and zero false-positive citations during reference queries
