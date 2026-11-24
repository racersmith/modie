---
summary: Fix VCS adapter propagation in pre-merge collision detection and extract core preflight validation so MCP complete_task fails atomically before committing or deleting task artifacts.

depends_on: []

links:
  - RULE-21
  - RULE-22
  - RULE-28
  - RULE-32
  - RULE-34
  - RULE-35
---

# Context

Two correctness and atomicity gaps were identified in the task lifecycle and MCP completion flow:

1. **Collision VCS isolation bug**: In `src/core/engine/lifecycle/collision-guard.ts`, `detectArtifactCollisions` resolves `effectiveVcs = ctx.vcs` and passes it to `inspectGitTreeArtifacts` for `sourceBranch` and `targetBranch`, but passes the raw optional `vcs` parameter when inspecting `mergeBase` (`inspectGitTreeArtifacts(mergeBase, cwd, undefined, vcs)`). When a caller passes a `WorkspaceContext` configured with a mock or custom `IVcsAdapter` (without passing the 4th `vcs` parameter), `baseArtifacts` silently falls back to `defaultVcsAdapter` (real git). Fix this to pass `effectiveVcs` and add a hermetic `MockVcsAdapter` regression test passing a `WorkspaceContext`.

2. **Atomic complete-and-merge preflight**: In `src/interfaces/mcp/handlers/lifecycle.ts`, `handleCompleteTask` currently pre-validates merge target resolution and target branch existence before calling `completeTask`, then runs `mergeTaskBranch`. However, `assertSourceBranchExists`, `assertNoActiveSubtasks`, and `assertNoForeignTaskAncestry` still only run inside `mergeTaskBranch` *after* `completeTask` has committed and deleted the task artifact on disk. If any of those guards fail, the repository is left with a deleted task artifact and premature commits, making retry via `complete_task` impossible. Extract a core preflight/orchestration helper (e.g. `assertTaskMergePreflight` or `completeAndMergeTask`) in `src/core/engine/lifecycle/` and invoke it from `handleCompleteTask` so merge-guard failures abort cleanly before any working-tree mutation or commit.

Starting points:
- `src/core/engine/lifecycle/collision-guard.ts` (`detectArtifactCollisions`)
- `src/core/engine/lifecycle/branching.ts` & `src/core/engine/lifecycle/branch-guard.ts`
- `src/interfaces/mcp/handlers/lifecycle.ts` (`handleCompleteTask`)
- `src/core/engine/lifecycle/branch-collisions.test.ts` & `src/interfaces/mcp/mcp-lifecycle.test.ts`

# Acceptance Criteria

- [x] Pre-merge artifact collision analysis consistently uses the resolved workspace VCS adapter across source, target, and merge-base tree inspections, verified by a hermetic mock-adapter test
- [x] A core lifecycle preflight/orchestration service validates source branch existence, merge target resolution and existence, absence of active child subtask branches, and absence of foreign task ancestry prior to committing or deleting a task artifact
- [x] MCP task completion invokes core preflight validation so merge-guard failures abort atomically without deleting the task artifact or creating partial completion commits
- [x] Isolated fixture-workspace unit and MCP integration tests verify preflight abort atomicity across missing target, active subtask, and foreign ancestry failures, with all repository verification checks passing
- [x] User Review
