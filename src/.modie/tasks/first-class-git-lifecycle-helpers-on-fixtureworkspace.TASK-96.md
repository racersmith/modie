---
summary: Promote reusable Git branch and task-completion ceremony helpers onto FixtureWorkspace and migrate core, CLI, and MCP tests off repetitive raw shell invocations.

depends_on: []

links:
  - RULE-21
  - RULE-28
  - RULE-34
  - RULE-35
---

# Context

During modularization of the lifecycle branching tests, reusable Git ceremony helpers (`createBranchingWorkspace`, `commitFile`, `completeTaskInGit`, `getCurrentBranch`, `getHeadHash`, `branchExistsInGit`) were introduced in `src/core/engine/lifecycle/test-helpers.ts`. However, CLI tests (`src/interfaces/cli/commands/task/task-branching-cli.test.ts`, `task-query.test.ts`) and MCP tests (`src/interfaces/mcp/mcp-lifecycle.test.ts`) still execute raw `Bun.$` Git commands for branch creation/deletion, task artifact deletion commits, current branch queries, and commit hash inspection.

Design guidance:
1. Promote declarative Git helpers onto `FixtureWorkspace` (e.g., `commitFile(relPath, content, message)`, `completeTaskArtifact(task)`, `gitCurrentBranch()`, `gitHeadHash(ref?)`, `gitBranchExists(branchName)`, `gitDeleteBranch(branchName, force?)`, and an optional trunk/protected-branch setup helper or option on `initGit`).
2. `src/core/platform/testing/fixture-workspace.ts` is already ~562 total lines (near the 500 non-blank/non-comment `oxlint` `max-lines` limit); extract a companion Git helper module (e.g. `src/core/platform/testing/fixture-git.ts`) if needed so all files in `src/core/platform/testing/` stay well below 500 lines and acyclic.
3. Migrate `src/core/engine/lifecycle/` branching tests (slimming or retiring `src/core/engine/lifecycle/test-helpers.ts`), `src/interfaces/cli/commands/task/task-branching-cli.test.ts`, `src/interfaces/cli/commands/task/task-query.test.ts`, and `src/interfaces/mcp/mcp-lifecycle.test.ts` to consume the shared `FixtureWorkspace` methods.
4. Keep `FixtureWorkspace` tests in `src/core/platform/testing/fixture-workspace.test.ts` updated to cover the new helpers.

Starting points:
- `src/core/platform/testing/fixture-workspace.ts` & `fixture-workspace.test.ts`
- `src/core/engine/lifecycle/test-helpers.ts`, `branch-collisions.test.ts`, `branch-guards.test.ts`, `task-branching.test.ts`, `task-origin-branching.test.ts`
- `src/interfaces/cli/commands/task/task-branching-cli.test.ts`, `task-query.test.ts`
- `src/interfaces/mcp/mcp-lifecycle.test.ts`

# Acceptance Criteria

- [ ] FixtureWorkspace exposes declarative Git helpers for committing files, executing task artifact deletion commits, inspecting current branch and commit hashes, and checking or deleting local branches
- [ ] Core lifecycle, CLI task branching/query, and MCP lifecycle test suites use FixtureWorkspace Git helpers in place of duplicated raw shell ceremony
- [ ] Fixture testing modules remain modular and within repository file-length lint limits without altering test isolation guarantees
- [ ] All repository verification checks and lint pass with zero warnings
- [ ] User Review
